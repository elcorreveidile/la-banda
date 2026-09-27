import type { NuevaRevision, Revision } from '@/db/firewall'
import type { FirewallStore } from '@/lib/firewall/store'

/** FirewallStore en memoria con la misma semántica que el de Drizzle, para tests. */
export function createFirewallMemoryStore() {
  const filas = new Map<string, Revision>()
  const completar = (n: NuevaRevision): Revision => ({
    logId: null,
    detail: null,
    userAgent: null,
    logCreatedAt: null,
    status: 'queued',
    verdict: null,
    confidence: null,
    rationale: null,
    cached: false,
    origenId: null,
    sessionId: null,
    avisoEstado: 'no_aplica',
    avisoIntentos: 0,
    avisoUltimoAt: null,
    avisoUltimoError: null,
    createdAt: new Date(),
    decidedAt: null,
    expiresAt: null,
    ...n,
  } as Revision)
  const todas = () => [...filas.values()]
  const abierta = (r: Revision) => r.status === 'queued' || r.status === 'running'

  const store: FirewallStore = {
    async get(id) {
      return filas.get(id) ?? null
    },
    async porLogId(logId) {
      return todas().find((r) => r.logId === logId) ?? null
    },
    async porSesion(sessionId) {
      return todas().find((r) => r.sessionId === sessionId) ?? null
    },
    async cacheVigente(patternKey, now, min) {
      return (
        todas()
          .filter((r) => r.patternKey === patternKey && r.status === 'done' && !r.cached && !r.origenId && (r.confidence ?? 0) >= min && r.expiresAt && r.expiresAt > now)
          .sort((a, b) => (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0))[0] ?? null
      )
    },
    async mesaEnCurso(patternKey) {
      return todas().find((r) => r.patternKey === patternKey && abierta(r) && !r.origenId && r.sessionId) ?? null
    },
    async mesasDesde(tenantId, desde) {
      return todas().filter((r) => r.tenantId === tenantId && r.createdAt >= desde && !r.cached && !r.origenId).length
    },
    async insertar(n) {
      const r = completar(n)
      filas.set(r.id, r)
      return { ...r }
    },
    async actualizar(id, patch) {
      const r = filas.get(id)
      if (r) filas.set(id, { ...r, ...patch } as Revision)
    },
    async enEspera(origenId) {
      return todas().filter((r) => r.origenId === origenId && abierta(r))
    },
    async mesasAbiertas() {
      return todas().filter((r) => abierta(r) && !r.origenId && r.sessionId)
    },
    async avisosPendientes() {
      return todas().filter((r) => r.avisoEstado === 'pendiente')
    },
    async borrarDatosPersona(antes) {
      let n = 0
      for (const r of todas()) {
        if (r.createdAt < antes && (r.detail !== null || r.userAgent !== null)) {
          filas.set(r.id, { ...r, detail: null, userAgent: null })
          n++
        }
      }
      return n
    },
  }
  return { store, filas }
}
