import { pgTable, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core'

/* ------------------------------------------------------------------ */
/* Dominio Sitios: un brief entra y la banda construye un sitio web.   */
/* Dos modos: wordnext (entrega por API en la plataforma) o estatico   */
/* (paquete HTML/CSS descargable). Dos alcances: sitio o paginas.      */
/* ------------------------------------------------------------------ */

export type ModoSitio = 'wordnext' | 'estatico'
export type AlcanceSitio = 'sitio' | 'paginas'
export type EstadoSitio = 'recibido' | 'entregado' | 'error_entrega'

export interface EntregaSitio {
  tipo: 'wordnext' | 'estatico'
  /** wordnext: resultado del endpoint de la plataforma. */
  tenantId?: string
  domain?: string
  url?: string
  /** estatico: ficheros del paquete (con descargaUrl lo sirven las rutas de paquete). */
  ficheros?: { path: string; bytes: number }[]
  descargaUrl?: string
  paginas?: number
  omitidas?: number
  /** Bloques/páginas descartados en la validación en código. */
  descartados?: string[]
  entregadoAt?: string
}

/** Un encargo de construcción. El brief NO viaja en el payload de la tarea. */
export const sites = pgTable(
  'sites',
  {
    id: text('id').primaryKey(),
    titulo: text('titulo').notNull(),
    modo: text('modo').$type<ModoSitio>().notNull(),
    alcance: text('alcance').$type<AlcanceSitio>().notNull(),
    /** El encargo en texto libre. */
    brief: text('brief').notNull(),
    /** Sitio WordNext existente (obligatorio si alcance = paginas). */
    tenantId: text('tenant_id'),
    /** Subdominio deseado, solo alcance sitio (x.wordnext.tech). */
    subdominio: text('subdominio'),
    estado: text('estado').$type<EstadoSitio>().notNull().default('recibido'),
    entrega: jsonb('entrega').$type<EntregaSitio>(),
    entregaError: text('entrega_error'),
    /** Informe del Profesor (resumen de la entrega). */
    informe: jsonb('informe'),
    sessionId: text('session_id'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    entregadoAt: timestamp('entregado_at', { withTimezone: true }),
  },
  (t) => [index('sites_session').on(t.sessionId)],
)

/** Ficheros del paquete estático (fila por fichero; texto plano, sin transacción). */
export const siteFiles = pgTable(
  'site_files',
  {
    id: text('id').primaryKey(),
    siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
    /** Ruta relativa dentro del paquete: index.html, contacto.html, styles.css… */
    path: text('path').notNull(),
    contenido: text('contenido').notNull(),
    bytes: integer('bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('site_files_site').on(t.siteId, t.path)],
)

export type Site = typeof sites.$inferSelect
export type SiteFile = typeof siteFiles.$inferSelect
