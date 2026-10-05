import type { NuevaPiezaPolitica, PiezaPolitica } from '@/db/politica'
import type { PoliticaStore } from '@/lib/politica/store'

/** Almacén en memoria del dominio política (mismo contrato que el real, incluido el cerrojo por externalRef). */
export function createPoliticaMemoryStore() {
  const filas: PiezaPolitica[] = []
  const store: PoliticaStore & { filas: PiezaPolitica[] } = {
    filas,
    pieza: async (id) => filas.find((p) => p.id === id) ?? null,
    piezaPorRef: async (ref) => filas.find((p) => p.externalRef === ref) ?? null,
    piezaPorSesion: async (sid) => filas.find((p) => p.sessionId === sid) ?? null,
    piezaPorRemoto: async (rid) => filas.find((p) => p.remotoId === rid) ?? null,
    async insertar(p: NuevaPiezaPolitica) {
      if (filas.some((f) => f.externalRef === p.externalRef)) return null
      const fila: PiezaPolitica = {
        id: p.id, tipo: p.tipo, edicion: p.edicion ?? null, dia: p.dia, externalRef: p.externalRef, titulo: p.titulo ?? null, encargo: p.encargo ?? null,
        envioRef: p.envioRef ?? null, estado: p.estado ?? 'en_curso', version: p.version ?? 1, sessionId: p.sessionId ?? null, programadoPara: p.programadoPara ?? null,
        veredicto: p.veredicto ?? null, motivo: p.motivo ?? null, nota: p.nota ?? null, remotoId: p.remotoId ?? null, url: p.url ?? null, reviewUrl: p.reviewUrl ?? null,
        createdAt: new Date(), updatedAt: new Date(),
      }
      filas.push(fila)
      return fila
    },
    async actualizar(id, patch) {
      const f = filas.find((p) => p.id === id)
      if (f) Object.assign(f, patch, { updatedAt: new Date() })
    },
    delDia: async (dia) => filas.filter((p) => p.dia === dia),
    recientes: async (limite, conArchivadas) => filas.filter((p) => conArchivadas || p.estado !== 'archivada').slice(-limite).reverse(),
    sesionesAbiertas: async () => [],
  }
  return store
}
