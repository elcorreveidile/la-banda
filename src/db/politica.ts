import { pgTable, text, timestamp, integer, index, uniqueIndex } from 'drizzle-orm/pg-core'

/* ------------------------------------------------------------------ */
/* Dominio Política (Con-textos 29N, de Olvidos de Granada): la banda  */
/* prepara tres entregas diarias verificadas (mañana, tarde y noche),  */
/* extras y comprobaciones de bulos, y las manda al sondeo por su API  */
/* firmada, donde una persona las aprueba. Sin veredicto con fuentes,  */
/* una noticia no se ve nunca.                                          */
/* ------------------------------------------------------------------ */

/**
 * Tipos de pieza:
 * - edicion: parte de la mañana, la tarde o la noche (programada con el cron).
 * - extra: encargo manual (madrugada, algo que ocurre).
 * - bulo: comprobación de una afirmación que circula.
 * - envio: verificación de una noticia enviada por un visitante registrado (ya existe en el sondeo).
 * - vigia: revisión horaria de las fuentes aprobadas; si hay novedad acaba como un extra pendiente, si no, se archiva.
 */
export type TipoPoliticaPieza = 'edicion' | 'extra' | 'bulo' | 'envio' | 'vigia'

/**
 * Estados: en_curso (mesa trabajando) → enviada (pendiente de revisión en el sondeo) → aprobada
 * (programada) → publicada; enviada → rechazada (con motivo); en_curso → vetada (Palermo) | fallida.
 */
export type EstadoPoliticaPieza = 'en_curso' | 'enviada' | 'aprobada' | 'publicada' | 'rechazada' | 'vetada' | 'fallida' | 'archivada'

export const ESTADOS_POLITICA: EstadoPoliticaPieza[] = ['en_curso', 'enviada', 'aprobada', 'publicada', 'rechazada', 'vetada', 'fallida', 'archivada']

export const politicaPiezas = pgTable(
  'politica_piezas',
  {
    id: text('id').primaryKey(),
    tipo: text('tipo').$type<TipoPoliticaPieza>().notNull(),
    /** manana | tarde | noche (ediciones) o madrugada | extra (manuales). */
    edicion: text('edicion'),
    /** Día de Madrid (AAAA-MM-DD) al que pertenece. */
    dia: text('dia').notNull(),
    /**
     * Idempotencia en el sondeo Y cerrojo local (sin transacciones): el índice único impide abrir dos
     * veces la misma edición. `29n:<día>:<edición>:v<versión>`, `29n:<día>:extra:<id>`, `29n:envio:<ref>`.
     */
    externalRef: text('external_ref').notNull(),
    titulo: text('titulo'),
    /** Extra: instrucción; bulo: la afirmación; envio: el texto del visitante. DATO NO FIABLE. */
    encargo: text('encargo'),
    /** Envío de visitante: referencia de la entrada en el sondeo. */
    envioRef: text('envio_ref'),
    estado: text('estado').$type<EstadoPoliticaPieza>().notNull().default('en_curso'),
    version: integer('version').notNull().default(1),
    sessionId: text('session_id'),
    /** Hora de publicación propuesta (09:00, 15:00 o 21:00 Madrid; la de un extra, la de apertura). */
    programadoPara: timestamp('programado_para', { withTimezone: true }),
    veredicto: text('veredicto'),
    /** Motivo del último veto, fallo o rechazo. */
    motivo: text('motivo'),
    /** Nota de Javier al pedir una reescritura. */
    nota: text('nota'),
    /** Id de la entrada en el sondeo, y sus enlaces. */
    remotoId: text('remoto_id'),
    url: text('url'),
    reviewUrl: text('review_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('politica_piezas_ref').on(t.externalRef),
    index('politica_piezas_estado').on(t.estado, t.createdAt),
    index('politica_piezas_sesion').on(t.sessionId),
    index('politica_piezas_dia').on(t.dia, t.edicion),
  ],
)

export type PiezaPolitica = typeof politicaPiezas.$inferSelect
export type NuevaPiezaPolitica = typeof politicaPiezas.$inferInsert
