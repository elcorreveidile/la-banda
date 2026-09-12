import { pgTable, text, timestamp, integer, index } from 'drizzle-orm/pg-core'

/* ------------------------------------------------------------------ */
/* Dominio Olvidos (brief §3): manuscripts, versions, objections       */
/* ------------------------------------------------------------------ */

export type ManuscriptFormat = 'md' | 'docx' | 'txt'

/** Un texto enviado a la redacción. El contenido vive en `versions`. */
export const manuscripts = pgTable('manuscripts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  /** Autor tal como firma (opcional). */
  byline: text('byline'),
  /** Clave de `domains/olvidos/secciones.ts`. */
  section: text('section').notNull(),
  format: text('format').$type<ManuscriptFormat>().notNull(),
  sourceName: text('source_name'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Cada versión del texto. La 1 es la enviada; las siguientes, reenvíos tras objeciones. */
export const versions = pgTable(
  'versions',
  {
    id: text('id').primaryKey(),
    manuscriptId: text('manuscript_id').notNull().references(() => manuscripts.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    /** Texto plano / Markdown. */
    text: text('text').notNull(),
    wordCount: integer('word_count').notNull(),
    /** Sesión de La Banda que evaluó esta versión (si la hay). */
    sessionId: text('session_id'),
    /** Veredicto registrado por Helsinki: publicable | con_cambios | rechazado. */
    decision: text('decision'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('versions_manuscript').on(t.manuscriptId, t.number)],
)

export type ObjectionSeverity = 'mayor' | 'menor'

/** Objeciones numeradas del informe (las registra Helsinki). Señalan, no corrigen. */
export const objections = pgTable(
  'objections',
  {
    id: text('id').primaryKey(),
    versionId: text('version_id').notNull().references(() => versions.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    number: integer('number').notNull(),
    /** Codename del agente que la señaló. */
    agent: text('agent').notNull(),
    severity: text('severity').$type<ObjectionSeverity>().notNull(),
    /** Dónde (párrafo, línea, cita…). */
    location: text('location'),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('objections_version').on(t.versionId, t.number), index('objections_session').on(t.sessionId)],
)

export type Manuscript = typeof manuscripts.$inferSelect
export type Version = typeof versions.$inferSelect
export type Objection = typeof objections.$inferSelect
