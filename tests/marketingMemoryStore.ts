import type { NuevaPieza, NuevoTema, Pieza, Tema } from '@/db/marketing'
import type { MarketingStore, SesionAbierta } from '@/lib/marketing/store'

/** Almacén en memoria del dominio marketing (mismo contrato que el de Drizzle). */
export function createMarketingMemoryStore() {
  const temas = new Map<string, Tema>()
  const piezas = new Map<string, Pieza>()
  const abiertas: SesionAbierta[] = []
  const EN_MARCHA = ['redactando', 'en_revision', 'publicado']

  const store: MarketingStore = {
    async tema(id) {
      return temas.get(id) ?? null
    },
    async temaPorSesion(sessionId) {
      return [...temas.values()].find((t) => t.sessionId === sessionId) ?? null
    },
    async insertarTema(t: NuevoTema) {
      const now = new Date()
      const row: Tema = {
        publico: null,
        palabrasClave: [],
        estado: 'propuesto',
        version: 1,
        planSessionId: null,
        sessionId: null,
        programadoPara: null,
        motivo: null,
        nota: null,
        decididoAt: null,
        createdAt: now,
        updatedAt: now,
        ...t,
      } as Tema
      temas.set(row.id, row)
      return row
    },
    async actualizarTema(id, patch) {
      const t = temas.get(id)
      if (t) temas.set(id, { ...t, ...patch, updatedAt: new Date() } as Tema)
    },
    async temasEnEstado(estados, destino) {
      return [...temas.values()].filter((t) => estados.includes(t.estado) && (!destino || t.destino === destino)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    },
    async temasDesde(destino, desde) {
      return [...temas.values()].filter((t) => t.destino === destino && t.createdAt >= desde)
    },
    async titulosRecientes(destino, limite) {
      return [...temas.values()].filter((t) => t.destino === destino).map((t) => t.titulo).slice(0, limite)
    },
    async programadosEntre(destino, desde, hasta) {
      return [...temas.values()].filter((t) => t.destino === destino && EN_MARCHA.includes(t.estado) && t.programadoPara && t.programadoPara >= desde && t.programadoPara < hasta)
    },
    async recientes(limite, conArchivados = false) {
      return [...temas.values()].filter((t) => conArchivados || t.estado !== 'archivado').slice(-limite).reverse()
    },
    async borrarTemas(ids) {
      for (const id of ids) {
        temas.delete(id)
        for (const [k, p] of piezas) if (p.temaId === id) piezas.delete(k)
      }
    },
    async pieza(externalRef) {
      return [...piezas.values()].find((p) => p.externalRef === externalRef) ?? null
    },
    async piezaPorWordnext(wordnextId) {
      return [...piezas.values()].find((p) => p.wordnextId === wordnextId) ?? null
    },
    async insertarPieza(p: NuevaPieza) {
      if ([...piezas.values()].some((x) => x.externalRef === p.externalRef)) throw new Error('externalRef repetido')
      const now = new Date()
      const row = { wordnextId: null, estado: 'pending', url: null, reviewUrl: null, feedback: null, scheduledAt: null, publishedAt: null, createdAt: now, updatedAt: now, ...p } as Pieza
      piezas.set(row.id, row)
      return row
    },
    async actualizarPieza(id, patch) {
      const p = piezas.get(id)
      if (p) piezas.set(id, { ...p, ...patch, updatedAt: new Date() } as Pieza)
    },
    async piezasDeTema(temaId, version) {
      return [...piezas.values()].filter((p) => p.temaId === temaId && (version === undefined || p.version === version))
    },
    async sesionesAbiertas() {
      return abiertas
    },
  }
  return { store, temas, piezas, abiertas }
}
