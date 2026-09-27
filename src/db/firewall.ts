import { pgTable, text, timestamp, integer, real, boolean, index } from 'drizzle-orm/pg-core'

/* ------------------------------------------------------------------ */
/* Dominio Firewall (Fase 2b de la web agéntica de WordNext): carril   */
/* profundo. wp-next-starter manda las cuarentenas por contenido y la  */
/* banda las juzga DESPUÉS (asíncrono): benigno (falso positivo) o     */
/* malicioso (se confirma el bloqueo). Veredicto por webhook + GET.    */
/* ------------------------------------------------------------------ */

export type EstadoRevision = 'queued' | 'running' | 'done' | 'failed'
export type VeredictoRevision = 'benign' | 'malicious'
export type EstadoAvisoRevision = 'pendiente' | 'enviado' | 'agotado' | 'no_aplica'

export const MOTIVOS_CUARENTENA = ['prompt-injection', 'exfiltration', 'arg-unexpected', 'unknown-tool', 'hidden-chars', 'param-schema', 'param-anomalous'] as const
export type MotivoCuarentena = (typeof MOTIVOS_CUARENTENA)[number]

/**
 * Una revisión de cuarentena. Tres orígenes:
 * - mesa propia (`cached` false, `origenId` null, `sessionId` = la sesión del dominio firewall);
 * - caché (`cached` true, `origenId` = la revisión cuyo veredicto se reutiliza; sin sesión);
 * - en espera (`origenId` = una mesa del MISMO patrón aún en curso; al cerrar esa mesa se
 *   copia su veredicto aquí con `cached` true).
 * Privacidad: `detail` y `userAgent` son los únicos datos de persona posibles; el cron los
 * pone a null pasado el TTL del caché (y las filas de caché/espera no los guardan nunca).
 */
export const firewallRevisiones = pgTable(
  'firewall_revisiones',
  {
    id: text('id').primaryKey(),
    /** Id de AgentRequestLog en wp-next-starter (idempotencia de reintentos). */
    logId: text('log_id'),
    tenantId: text('tenant_id').notNull(),
    host: text('host').notNull(),
    target: text('target').notNull(),
    reason: text('reason').$type<MotivoCuarentena>().notNull(),
    detail: text('detail'),
    userAgent: text('user_agent'),
    /** createdAt de la petición en wp-next-starter. */
    logCreatedAt: timestamp('log_created_at', { withTimezone: true }),
    /** sha256(motivo + destino + fragmento normalizado). */
    patternKey: text('pattern_key').notNull(),
    status: text('status').$type<EstadoRevision>().notNull().default('queued'),
    verdict: text('verdict').$type<VeredictoRevision>(),
    confidence: real('confidence'),
    rationale: text('rationale'),
    cached: boolean('cached').notNull().default(false),
    origenId: text('origen_id'),
    sessionId: text('session_id'),
    avisoEstado: text('aviso_estado').$type<EstadoAvisoRevision>().notNull().default('no_aplica'),
    avisoIntentos: integer('aviso_intentos').notNull().default(0),
    avisoUltimoAt: timestamp('aviso_ultimo_at', { withTimezone: true }),
    avisoUltimoError: text('aviso_ultimo_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    /** Hasta cuándo sirve como caché (decidedAt + TTL); null si no es cacheable. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    index('firewall_revisiones_patron').on(t.patternKey, t.decidedAt),
    index('firewall_revisiones_tenant_dia').on(t.tenantId, t.createdAt),
    index('firewall_revisiones_log').on(t.logId),
    index('firewall_revisiones_sesion').on(t.sessionId),
    index('firewall_revisiones_origen').on(t.origenId),
    index('firewall_revisiones_aviso').on(t.avisoEstado, t.avisoUltimoAt),
  ],
)

export type Revision = typeof firewallRevisiones.$inferSelect
export type NuevaRevision = typeof firewallRevisiones.$inferInsert
