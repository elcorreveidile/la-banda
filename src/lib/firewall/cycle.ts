/**
 * Ciclo del carril profundo del firewall.
 *
 * `abrirRevision`: entra una cuarentena de wp-next-starter y se resuelve, en este orden,
 *   1. idempotencia por `logId` (un reintento del remitente devuelve la misma revisión);
 *   2. caché por patrón (veredicto propio vigente y con confianza ≥ 0,7) → `cached`, sin modelo;
 *   3. espera: si ya hay una mesa del mismo patrón en curso, la revisión espera su veredicto;
 *   4. tope por tenant y día (defensa en profundidad) → `rate-limited`;
 *   5. mesa nueva: fila + sesión del dominio firewall (quien llama lanza el tick).
 * `finalizarRevisionDeSesion`: al terminar la sesión, veredicto a la fila, a las que esperan
 *   y primer aviso por webhook. Lo llama el tick (hook) y, como red, el cron.
 * `cicloFirewall`: cron. Cierra mesas terminadas que nadie cerró, reintenta avisos, borra
 *   datos de persona y la traza pasado el TTL.
 */

import type { MotivoCuarentena, Revision } from '@/db/firewall'
import { CONFIANZA_MINIMA_CACHE, cacheTtlMs, inicioDiaUtc, maxPorTenantDia } from './config'
import { patternKey } from './patron'
import { veredictoDeSesion } from './veredicto'
import type { FirewallStore, LeerSesion } from './store'
import { agotadoAviso, avisoConfigurado, intentarAvisoRevision, venceAviso, type DepsAviso } from './webhook'

export interface Cuarentena {
  logId: string | null
  tenantId: string
  host: string
  target: string
  reason: MotivoCuarentena
  detail: string | null
  userAgent: string | null
  createdAt: Date
}

export interface DepsAbrir {
  store: FirewallStore
  /** Abre la sesión del dominio firewall para la revisión y devuelve su id (no lanza ticks). */
  abrirMesa: (rev: Revision) => Promise<string>
  /** ¿Hay clave para los modelos del firewall? Sin ella no se abre mesa (caché y espera sí). */
  modelosOk?: () => boolean
  now?: () => number
}

export type ResultadoAbrir =
  | { tipo: 'existente'; revision: Revision }
  | { tipo: 'cached'; revision: Revision }
  | { tipo: 'espera'; revision: Revision }
  | { tipo: 'mesa'; revision: Revision; sessionId: string }
  | { tipo: 'rate-limited'; limite: number }
  | { tipo: 'sin-modelos' }

const uuid = () => crypto.randomUUID()

export async function abrirRevision(c: Cuarentena, deps: DepsAbrir): Promise<ResultadoAbrir> {
  const { store } = deps
  const now = (deps.now ?? Date.now)()
  const clave = patternKey(c.reason, c.target, c.detail)
  const base = { logId: c.logId, tenantId: c.tenantId, host: c.host, target: c.target, reason: c.reason, logCreatedAt: c.createdAt, patternKey: clave, createdAt: new Date(now) }

  if (c.logId) {
    const previa = await store.porLogId(c.logId)
    if (previa) return { tipo: 'existente', revision: previa }
  }

  // Caché: la fila nueva NO guarda detail ni userAgent (minimización) ni avisa (el veredicto va en la respuesta).
  const hit = await store.cacheVigente(clave, new Date(now), CONFIANZA_MINIMA_CACHE)
  if (hit) {
    const revision = await store.insertar({
      id: uuid(),
      ...base,
      status: 'done',
      verdict: hit.verdict,
      confidence: hit.confidence,
      rationale: hit.rationale,
      cached: true,
      origenId: hit.id,
      decidedAt: new Date(now),
      avisoEstado: 'no_aplica',
    })
    return { tipo: 'cached', revision }
  }

  const enCurso = await store.mesaEnCurso(clave)
  if (enCurso) {
    const revision = await store.insertar({ id: uuid(), ...base, status: 'queued', origenId: enCurso.id })
    // Carrera: la mesa pudo cerrarse entre la consulta y el alta; entonces se copia ya.
    const origen = await store.get(enCurso.id)
    if (origen?.status === 'done' && origen.verdict) {
      await store.actualizar(revision.id, { status: 'done', verdict: origen.verdict, confidence: origen.confidence, rationale: origen.rationale, cached: true, decidedAt: new Date(now) })
      return { tipo: 'cached', revision: (await store.get(revision.id)) ?? revision }
    }
    return { tipo: 'espera', revision }
  }

  if (deps.modelosOk && !deps.modelosOk()) return { tipo: 'sin-modelos' }

  const limite = maxPorTenantDia()
  if ((await store.mesasDesde(c.tenantId, inicioDiaUtc(now))) >= limite) return { tipo: 'rate-limited', limite }

  const revision = await store.insertar({ id: uuid(), ...base, detail: c.detail, userAgent: c.userAgent, status: 'queued' })
  try {
    const sessionId = await deps.abrirMesa(revision)
    await store.actualizar(revision.id, { sessionId })
    return { tipo: 'mesa', revision: { ...revision, sessionId }, sessionId }
  } catch (err) {
    await store.actualizar(revision.id, { status: 'failed', rationale: 'no se pudo abrir la mesa', decidedAt: new Date(now) })
    throw err
  }
}

export interface DepsCierre {
  store: FirewallStore
  sesion: LeerSesion
  now?: () => number
  aviso?: DepsAviso
}

/** Deja la fila lista para avisar: `pendiente` si hay webhook configurado. */
function avisoInicial(env?: Record<string, string | undefined>) {
  return avisoConfigurado(env) ? ('pendiente' as const) : ('no_aplica' as const)
}

async function avisarSiToca(store: FirewallStore, id: string, deps: DepsCierre): Promise<void> {
  const fila = await store.get(id)
  if (fila && fila.avisoEstado === 'pendiente' && fila.avisoIntentos === 0) await intentarAvisoRevision(store, fila, { ...deps.aviso, now: deps.now ?? deps.aviso?.now })
}

/**
 * Si la sesión de la revisión terminó, escribe el veredicto (o el fallo), lo copia a las
 * revisiones en espera y lanza el primer aviso. Idempotente: una fila ya terminada no se toca.
 * Devuelve la revisión terminada o null si no había nada que cerrar.
 */
export async function finalizarRevision(rev: Revision, deps: DepsCierre): Promise<Revision | null> {
  const { store } = deps
  if (!rev.sessionId || rev.status === 'done' || rev.status === 'failed') return null
  const s = await deps.sesion(rev.sessionId)
  if (!s || s.status === 'open') return null

  const now = new Date((deps.now ?? Date.now)())
  const env = deps.aviso?.env
  const v = veredictoDeSesion(s.status, s.finalReport, rev.detail)
  const patch = v
    ? {
        status: 'done' as const,
        verdict: v.verdict,
        confidence: v.confidence,
        rationale: v.rationale,
        decidedAt: now,
        expiresAt: v.confidence >= CONFIANZA_MINIMA_CACHE ? new Date(now.getTime() + cacheTtlMs()) : null,
        avisoEstado: avisoInicial(env),
      }
    : { status: 'failed' as const, rationale: 'la mesa no llegó a veredicto', decidedAt: now, avisoEstado: avisoInicial(env) }
  await store.actualizar(rev.id, patch)

  for (const w of await store.enEspera(rev.id)) {
    await store.actualizar(
      w.id,
      v
        ? { status: 'done', verdict: v.verdict, confidence: v.confidence, rationale: v.rationale, cached: true, decidedAt: now, avisoEstado: avisoInicial(env) }
        : { status: 'failed', rationale: 'la mesa del mismo patrón no llegó a veredicto', decidedAt: now, avisoEstado: avisoInicial(env) },
    )
    await avisarSiToca(store, w.id, deps)
  }
  await avisarSiToca(store, rev.id, deps)
  return store.get(rev.id)
}

/** Hook del tick: cierra la revisión de una sesión del dominio firewall si ya terminó. */
export async function finalizarRevisionDeSesion(sessionId: string, deps: DepsCierre): Promise<Revision | null> {
  const rev = await deps.store.porSesion(sessionId)
  return rev ? finalizarRevision(rev, deps) : null
}

/** Hook del tick, antes de procesar: la mesa pasa a `running`. */
export async function marcarEnCurso(sessionId: string, store: FirewallStore): Promise<void> {
  const rev = await store.porSesion(sessionId)
  if (rev?.status === 'queued') await store.actualizar(rev.id, { status: 'running' })
}

export interface ResultadoCicloFirewall {
  cerradas: string[]
  avisadas: string[]
  fallidas: Record<string, string>
  agotadas: string[]
  datosBorrados: number
}

/** Ciclo del cron (/api/cron/firewall). La purga de la traza de sesiones la hace la ruta (motor). */
export async function cicloFirewall(deps: DepsCierre): Promise<ResultadoCicloFirewall> {
  const { store } = deps
  const now = (deps.now ?? Date.now)()
  const r: ResultadoCicloFirewall = { cerradas: [], avisadas: [], fallidas: {}, agotadas: [], datosBorrados: 0 }

  for (const rev of await store.mesasAbiertas()) {
    const fin = await finalizarRevision(rev, deps)
    if (fin) r.cerradas.push(fin.id)
  }

  for (const rev of await store.avisosPendientes()) {
    if (agotadoAviso(rev, now)) {
      await store.actualizar(rev.id, { avisoEstado: 'agotado' })
      r.agotadas.push(rev.id)
      continue
    }
    if (!venceAviso(rev, now)) continue
    const res = await intentarAvisoRevision(store, rev, { ...deps.aviso, now: () => now })
    if (res.ok) r.avisadas.push(rev.id)
    else r.fallidas[rev.id] = res.error ?? 'error'
  }

  r.datosBorrados = await store.borrarDatosPersona(new Date(now - cacheTtlMs()))
  return r
}
