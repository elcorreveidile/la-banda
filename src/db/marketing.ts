import { pgTable, text, timestamp, integer, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'

/* ------------------------------------------------------------------ */
/* Dominio Marketing (Fase 3 del marketing de WordNext): La Banda      */
/* propone temas, Javier los aprueba, la banda redacta cada artículo   */
/* en ES + EN (Río con Fable) y lo manda a WordNext por la API de      */
/* publicación, donde una persona lo aprueba. Nada sale sin revisión.  */
/* ------------------------------------------------------------------ */

/**
 * Estados de un tema:
 * propuesto → aprobado (Javier, panel) | descartado
 * aprobado → redactando (sesión de la banda) → en_revision (enviado a WordNext) → publicado
 * en_revision → rechazado (la persona lo rechazó en WordNext, con motivo)
 * redactando → vetado (Palermo no lo aprobó) | fallido (la mesa o el envío fallaron)
 * rechazado | vetado | fallido → aprobado (Javier pide reescribirlo; versión + 1)
 */
export type EstadoTema = 'propuesto' | 'aprobado' | 'descartado' | 'redactando' | 'en_revision' | 'publicado' | 'rechazado' | 'vetado' | 'fallido' | 'archivado'

export const ESTADOS_TEMA: EstadoTema[] = ['propuesto', 'aprobado', 'descartado', 'redactando', 'en_revision', 'publicado', 'rechazado', 'vetado', 'fallido', 'archivado']

export const marketingTemas = pgTable(
  'marketing_temas',
  {
    id: text('id').primaryKey(),
    /** Web de destino (host del tenant en WordNext), p. ej. blog.wordnext.tech. */
    destino: text('destino').notNull(),
    /** Categoría (una de las 8 del escaparate o «firewall-ia»). */
    categoria: text('categoria').notNull(),
    titulo: text('titulo').notNull(),
    /** Enfoque del artículo: qué problema resuelve y para quién. */
    angulo: text('angulo').notNull(),
    publico: text('publico'),
    palabrasClave: jsonb('palabras_clave').$type<string[]>().notNull().default([]),
    estado: text('estado').$type<EstadoTema>().notNull().default('propuesto'),
    /** Sube cada vez que Javier pide reescribirlo (el externalRef de WordNext cambia con ella). */
    version: integer('version').notNull().default(1),
    /** Sesión que lo propuso (plan) y sesión que lo redacta (la última). */
    planSessionId: text('plan_session_id'),
    sessionId: text('session_id'),
    /** Fecha de publicación propuesta a WordNext (martes o jueves 09:00 Madrid de la semana siguiente). */
    programadoPara: timestamp('programado_para', { withTimezone: true }),
    /** Motivo del último rechazo (WordNext), veto (Palermo) o fallo. */
    motivo: text('motivo'),
    /** Nota de Javier al aprobar o al pedir reescritura (llega a la mesa como dato). */
    nota: text('nota'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decididoAt: timestamp('decidido_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('marketing_temas_estado').on(t.estado, t.createdAt), index('marketing_temas_sesion').on(t.sessionId)],
)

export type EstadoPieza = 'pending' | 'approved' | 'published' | 'rejected' | 'cancelled'

/** Una versión de idioma de un tema enviada a WordNext (una pieza de la API de publicación). */
export const marketingPiezas = pgTable(
  'marketing_piezas',
  {
    id: text('id').primaryKey(),
    temaId: text('tema_id').notNull(),
    version: integer('version').notNull(),
    locale: text('locale').notNull(),
    titulo: text('titulo').notNull(),
    /** `lb-mkt.<temaId>.v<version>.<locale>`: idempotencia en WordNext. */
    externalRef: text('external_ref').notNull(),
    /** Id de la pieza en WordNext (ContentPiece). */
    wordnextId: text('wordnext_id'),
    estado: text('estado').$type<EstadoPieza>().notNull().default('pending'),
    url: text('url'),
    reviewUrl: text('review_url'),
    feedback: text('feedback'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('marketing_piezas_ref').on(t.externalRef), index('marketing_piezas_tema').on(t.temaId), index('marketing_piezas_wordnext').on(t.wordnextId)],
)

export type Tema = typeof marketingTemas.$inferSelect
export type NuevoTema = typeof marketingTemas.$inferInsert
export type Pieza = typeof marketingPiezas.$inferSelect
export type NuevaPieza = typeof marketingPiezas.$inferInsert
