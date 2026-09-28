import { pgTable, text, timestamp, integer, jsonb, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core'

/* ------------------------------------------------------------------ */
/* Red de webs agénticas (Fase 4a): registro de nodos y negociación    */
/* B2B de solicitudes de presupuesto. Registro CENTRALIZADO en La      */
/* Banda (solo webs WordNext por ahora; federado más adelante). Todo   */
/* mensaje entre nodos pasa por aquí con la credencial de cada nodo.   */
/* ------------------------------------------------------------------ */

export type TipoItem = 'producto' | 'servicio'

/** Un producto o servicio que el nodo ofrece. `minimoCents` es PRIVADO del vendedor. */
export interface ItemCatalogo {
  id: string
  tipo: TipoItem
  nombre: string
  /** Precio de lista por unidad, en céntimos de euro. */
  precioCents: number
  /** Precio mínimo por unidad que acepta el dueño (privado). Null = sin mínimo propio. */
  minimoCents?: number | null
}

/** Límites de negociación que fija el dueño del nodo (privados). */
export interface LimitesVendedor {
  /** Descuento máximo sobre el precio de lista, en % (0-90). */
  descuentoMaxPct: number
  /** Rondas máximas de oferta del vendedor (1-10). */
  rondasMax: number
}

export const nodos = pgTable(
  'red_nodos',
  {
    id: text('id').primaryKey(),
    /** Tenant de WordNext al que representa (uno por tenant). */
    tenantId: text('tenant_id').notNull(),
    host: text('host').notNull(),
    nombre: text('nombre').notNull(),
    /** Sector (perfil del tenant: docencia, restaurante, servicios, tienda, general). */
    sector: text('sector').notNull().default('general'),
    /** Capacidades anunciadas (MVP: ['quote']). */
    capacidades: jsonb('capacidades').$type<string[]>().notNull().default([]),
    catalogo: jsonb('catalogo').$type<ItemCatalogo[]>().notNull().default([]),
    limites: jsonb('limites').$type<LimitesVendedor>().notNull(),
    /** sha256 de la credencial del nodo (la credencial en claro solo se entrega una vez). */
    claveHash: text('clave_hash').notNull(),
    activo: boolean('activo').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('red_nodos_tenant').on(t.tenantId), index('red_nodos_activo').on(t.activo, t.sector)],
)

export type Nodo = typeof nodos.$inferSelect
export type NuevoNodo = typeof nodos.$inferInsert

export type EstadoNegociacion =
  | 'negociando'
  | 'propuesta' // acuerdo dentro de los límites; falta la aprobación HUMANA de las dos partes
  | 'acordada' // las dos partes aprobaron
  | 'rechazada' // una parte rechazó la propuesta
  | 'sin_acuerdo' // no hay zona de acuerdo o se agotaron las rondas
  | 'vetada' // inyección, límite roto o veto del cortafuegos
  | 'fallida' // la mesa no llegó a término (error, tope de pasos, abandono)

export type Parte = 'comprador' | 'vendedor'

/** Turno: parte que debe mover, o fin decidido por el código. */
export type Turno = Parte | 'cerrar' | 'sin_acuerdo'

export interface LineaSolicitud {
  itemId: string
  cantidad: number
}

export interface LineaPrecio extends LineaSolicitud {
  precioUnitCents: number
}

export interface Oferta {
  ronda: number
  de: Parte
  tipo: 'oferta' | 'contraoferta' | 'aceptacion'
  /** Solo en las ofertas del vendedor (y en la aceptación, copia de la aceptada). */
  lineas?: LineaPrecio[]
  totalCents: number
  mensaje: string
  at: string
}

export interface Propuesta {
  lineas: (LineaPrecio & { nombre: string; tipo: TipoItem })[]
  totalCents: number
  moneda: 'EUR'
  ronda: number
}

/** Lo que el vendedor ofrecía al abrir (congelado: un cambio de catálogo no altera la mesa). */
export interface SnapshotVendedor {
  items: ItemCatalogo[]
  limites: LimitesVendedor
}

export const negociaciones = pgTable(
  'red_negociaciones',
  {
    id: text('id').primaryKey(),
    compradorNodoId: text('comprador_nodo_id').notNull(),
    vendedorNodoId: text('vendedor_nodo_id').notNull(),
    /** Id externo del comprador (p. ej. id de la negociación en WordNext). */
    referencia: text('referencia'),
    texto: text('texto').notNull(),
    lineas: jsonb('lineas').$type<LineaSolicitud[]>().notNull(),
    /** Presupuesto máximo del comprador (privado del comprador). */
    presupuestoMaxCents: integer('presupuesto_max_cents').notNull(),
    vendedor: jsonb('vendedor').$type<SnapshotVendedor>().notNull(),
    estado: text('estado').$type<EstadoNegociacion>().notNull().default('negociando'),
    motivo: text('motivo'),
    ofertas: jsonb('ofertas').$type<Oferta[]>().notNull().default([]),
    /** Intentos de oferta rechazados por el código (fuera de límites). */
    intentosFueraDeLimite: integer('intentos_fuera_limite').notNull().default(0),
    /** A quién le toca mover: lo decide el código tras cada movimiento válido. */
    turno: text('turno').$type<Turno>().notNull().default('vendedor'),
    /** Movimientos que el árbitro ya ha visto (si no hay uno nuevo, la parte no movió bien). */
    ofertasVistas: integer('ofertas_vistas').notNull().default(0),
    /** Desenlace que fija el CÓDIGO (árbitro o Helsinki); el cierre de la mesa lo aplica. */
    desenlace: text('desenlace').$type<'propuesta' | 'sin_acuerdo' | 'vetada'>(),
    /** Parte cuyo mensaje intentó manipular a la otra (inyección) → veto. */
    inyeccionDe: text('inyeccion_de').$type<Parte>(),
    propuesta: jsonb('propuesta').$type<Propuesta>(),
    aprobadaCompradorAt: timestamp('aprobada_comprador_at', { withTimezone: true }),
    aprobadaVendedorAt: timestamp('aprobada_vendedor_at', { withTimezone: true }),
    rechazadaPor: text('rechazada_por').$type<Parte>(),
    sessionId: text('session_id'),
    avisoEstado: text('aviso_estado').$type<'pendiente' | 'enviado' | 'agotado' | 'no_aplica'>().notNull().default('no_aplica'),
    avisoIntentos: integer('aviso_intentos').notNull().default(0),
    avisoUltimoAt: timestamp('aviso_ultimo_at', { withTimezone: true }),
    avisoUltimoError: text('aviso_ultimo_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    cerradaAt: timestamp('cerrada_at', { withTimezone: true }),
  },
  (t) => [
    index('red_negociaciones_comprador').on(t.compradorNodoId, t.createdAt),
    index('red_negociaciones_vendedor').on(t.vendedorNodoId, t.createdAt),
    index('red_negociaciones_sesion').on(t.sessionId),
    index('red_negociaciones_aviso').on(t.avisoEstado, t.avisoUltimoAt),
  ],
)

export type Negociacion = typeof negociaciones.$inferSelect
export type NuevaNegociacion = typeof negociaciones.$inferInsert
