import { pgTable, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core'

/* ------------------------------------------------------------------ */
/* Dominio Peticiones: una petición libre entra, la banda la analiza   */
/* y entrega un informe (finalReport + webhook al solicitante).        */
/* ------------------------------------------------------------------ */

export type EstadoPeticion = 'recibida' | 'en_curso' | 'completada' | 'fallida' | 'vetada'
export type EstadoAviso = 'pendiente' | 'enviado' | 'agotado' | 'no_aplica'

/** Una petición libre. El texto NO viaja en el payload de la tarea: las
 *  herramientas lo leen de aquí (dossier ligero, webhook fuera de los prompts). */
export const peticiones = pgTable(
  'peticiones',
  {
    id: text('id').primaryKey(),
    titulo: text('titulo').notNull(),
    /** La petición en texto libre (lo que pide el solicitante). */
    texto: text('texto').notNull(),
    /** URL https a la que avisar con el informe (opcional). */
    webhookUrl: text('webhook_url'),
    /** Id externo del solicitante; viaja de vuelta en el webhook. */
    referencia: text('referencia'),
    estado: text('estado').$type<EstadoPeticion>().notNull().default('recibida'),
    /** Informe registrado por Helsinki (o compuesto por el cron de huecos). */
    informe: jsonb('informe'),
    sessionId: text('session_id'),
    avisoEstado: text('aviso_estado').$type<EstadoAviso>().notNull().default('no_aplica'),
    avisoIntentos: integer('aviso_intentos').notNull().default(0),
    avisoUltimoAt: timestamp('aviso_ultimo_at', { withTimezone: true }),
    avisoUltimoError: text('aviso_ultimo_error'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completadaAt: timestamp('completada_at', { withTimezone: true }),
  },
  (t) => [index('peticiones_aviso').on(t.avisoEstado, t.avisoUltimoAt)],
)

/** Cada intento de aviso (webhook), para trazabilidad y depuración. */
export const peticionesAvisos = pgTable(
  'peticiones_avisos',
  {
    id: text('id').primaryKey(),
    peticionId: text('peticion_id').notNull().references(() => peticiones.id, { onDelete: 'cascade' }),
    intento: integer('intento').notNull(),
    /** ok | error */
    estado: text('estado').notNull(),
    /** Código HTTP del receptor, si lo hubo. */
    codigo: integer('codigo'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('peticiones_avisos_peticion').on(t.peticionId, t.intento)],
)

export type Peticion = typeof peticiones.$inferSelect
export type PeticionAviso = typeof peticionesAvisos.$inferSelect
