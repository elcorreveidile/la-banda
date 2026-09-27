/**
 * Almacén de revisiones del firewall. Interfaz para poder testear el ciclo con memoria
 * (`tests/firewallMemoryStore.ts`); la implementación real va por Drizzle + neon-http,
 * fila a fila y sin transacciones.
 */

import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm'
import { db } from '@/db'
import { sessions, tasks } from '@/db/schema'
import type { SessionStatus } from '@/db/schema'
import { firewallRevisiones, type NuevaRevision, type Revision } from '@/db/firewall'

export interface FirewallStore {
  get(id: string): Promise<Revision | null>
  porLogId(logId: string): Promise<Revision | null>
  porSesion(sessionId: string): Promise<Revision | null>
  /** Veredicto propio (de mesa) vigente para el patrón, con confianza suficiente. El más reciente. */
  cacheVigente(patternKey: string, now: Date, confianzaMinima: number): Promise<Revision | null>
  /** Mesa propia del patrón aún sin terminar (queued|running). */
  mesaEnCurso(patternKey: string): Promise<Revision | null>
  /** Mesas abiertas por el tenant desde `desde` (no cuentan caché ni espera). */
  mesasDesde(tenantId: string, desde: Date): Promise<number>
  insertar(r: NuevaRevision): Promise<Revision>
  actualizar(id: string, patch: Partial<NuevaRevision>): Promise<void>
  /** Revisiones en espera de la mesa `origenId`. */
  enEspera(origenId: string): Promise<Revision[]>
  /** Mesas propias sin terminar (para cerrar las que ya acabaron). */
  mesasAbiertas(): Promise<Revision[]>
  /** Revisiones con aviso pendiente. */
  avisosPendientes(): Promise<Revision[]>
  /** Borra detail/userAgent de las revisiones anteriores a `antes`. Devuelve cuántas. */
  borrarDatosPersona(antes: Date): Promise<number>
}

/** Lo mínimo de una sesión del motor que necesita el ciclo. */
export type LeerSesion = (id: string) => Promise<{ status: SessionStatus; finalReport: unknown } | null>

export const leerSesionDb: LeerSesion = async (id) => {
  const [s] = await db.select({ status: sessions.status, finalReport: sessions.finalReport }).from(sessions).where(eq(sessions.id, id)).limit(1)
  return s ?? null
}

/** La revisión que juzga una tarea (leída de su payload, patrón peticionForTask). */
export async function revisionForTask(taskId: string): Promise<Revision | null> {
  const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  const payload = (t?.payload ?? {}) as { revisionId?: string }
  if (!payload.revisionId) return null
  return firewallStoreDb.get(payload.revisionId)
}

const r = firewallRevisiones
const uno = async (q: Promise<Revision[]>) => (await q)[0] ?? null

export const firewallStoreDb: FirewallStore = {
  get: (id) => uno(db.select().from(r).where(eq(r.id, id)).limit(1)),
  porLogId: (logId) => uno(db.select().from(r).where(eq(r.logId, logId)).orderBy(asc(r.createdAt)).limit(1)),
  porSesion: (sessionId) => uno(db.select().from(r).where(eq(r.sessionId, sessionId)).limit(1)),
  cacheVigente: (patternKey, now, confianzaMinima) =>
    uno(
      db
        .select()
        .from(r)
        .where(and(eq(r.patternKey, patternKey), eq(r.status, 'done'), eq(r.cached, false), isNull(r.origenId), gte(r.confidence, confianzaMinima), gt(r.expiresAt, now)))
        .orderBy(desc(r.decidedAt))
        .limit(1),
    ),
  mesaEnCurso: (patternKey) =>
    uno(
      db
        .select()
        .from(r)
        .where(and(eq(r.patternKey, patternKey), inArray(r.status, ['queued', 'running']), isNull(r.origenId), isNotNull(r.sessionId)))
        .orderBy(desc(r.createdAt))
        .limit(1),
    ),
  async mesasDesde(tenantId, desde) {
    const [c] = await db
      .select({ n: count() })
      .from(r)
      .where(and(eq(r.tenantId, tenantId), gte(r.createdAt, desde), eq(r.cached, false), isNull(r.origenId)))
    return c?.n ?? 0
  },
  async insertar(nueva) {
    const [row] = await db.insert(r).values(nueva).returning()
    return row
  },
  async actualizar(id, patch) {
    await db.update(r).set(patch).where(eq(r.id, id))
  },
  enEspera: (origenId) => db.select().from(r).where(and(eq(r.origenId, origenId), inArray(r.status, ['queued', 'running']))),
  mesasAbiertas: () => db.select().from(r).where(and(inArray(r.status, ['queued', 'running']), isNull(r.origenId), isNotNull(r.sessionId))),
  avisosPendientes: () => db.select().from(r).where(eq(r.avisoEstado, 'pendiente')),
  async borrarDatosPersona(antes) {
    const filas = await db
      .update(r)
      .set({ detail: null, userAgent: null })
      .where(and(lt(r.createdAt, antes), or(isNotNull(r.detail), isNotNull(r.userAgent))))
      .returning({ id: r.id })
    return filas.length
  },
}
