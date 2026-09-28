import type { Negociacion, NuevaNegociacion, Nodo, NuevoNodo } from '@/db/negociacion'
import type { RedStore } from '@/lib/negociacion/store'

/** RedStore en memoria con la misma semántica que el de Drizzle, para tests. */
export function createRedMemoryStore() {
  const nodos = new Map<string, Nodo>()
  const negs = new Map<string, Negociacion>()
  const store: RedStore = {
    async nodo(id) {
      return nodos.get(id) ?? null
    },
    async nodoPorTenant(t) {
      return [...nodos.values()].find((n) => n.tenantId === t) ?? null
    },
    async insertarNodo(n: NuevoNodo) {
      const fila = { sector: 'general', capacidades: [], catalogo: [], activo: true, createdAt: new Date(), updatedAt: new Date(), ...n } as Nodo
      nodos.set(fila.id, fila)
      return fila
    },
    async actualizarNodo(id, patch) {
      const n = nodos.get(id)
      if (n) nodos.set(id, { ...n, ...patch, updatedAt: new Date() } as Nodo)
    },
    async buscarNodos(f) {
      return [...nodos.values()].filter((n) => n.activo && (!f.sector || n.sector === f.sector) && (!f.capacidad || n.capacidades.includes(f.capacidad))).slice(0, f.limite)
    },
    async negociacion(id) {
      return negs.get(id) ?? null
    },
    async negociacionPorSesion(s) {
      return [...negs.values()].find((n) => n.sessionId === s) ?? null
    },
    async insertarNegociacion(n: NuevaNegociacion) {
      const fila = {
        referencia: null,
        estado: 'negociando',
        motivo: null,
        ofertas: [],
        intentosFueraDeLimite: 0,
        turno: 'vendedor',
        ofertasVistas: 0,
        desenlace: null,
        inyeccionDe: null,
        propuesta: null,
        aprobadaCompradorAt: null,
        aprobadaVendedorAt: null,
        rechazadaPor: null,
        sessionId: null,
        avisoEstado: 'no_aplica',
        avisoIntentos: 0,
        avisoUltimoAt: null,
        avisoUltimoError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        cerradaAt: null,
        ...n,
      } as Negociacion
      negs.set(fila.id, fila)
      return fila
    },
    async actualizarNegociacion(id, patch) {
      const n = negs.get(id)
      if (n) negs.set(id, { ...n, ...patch, updatedAt: new Date() } as Negociacion)
    },
    async negociacionesDesde(c, desde) {
      return [...negs.values()].filter((n) => n.compradorNodoId === c && n.createdAt >= desde).length
    },
    async negociacionesAbiertas() {
      return [...negs.values()].filter((n) => n.estado === 'negociando' && n.sessionId)
    },
    async avisosPendientes() {
      return [...negs.values()].filter((n) => n.avisoEstado === 'pendiente')
    },
    async propuestasPendientes() {
      return [...negs.values()].filter((n) => n.estado === 'propuesta')
    },
  }
  return { store, nodos, negs }
}
