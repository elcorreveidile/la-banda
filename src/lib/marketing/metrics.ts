import type { Pieza, Tema } from '@/db/marketing'
import { leerSesion, marketingStoreDb } from './store'
import { informesDe } from './ciclo'
import type { InformeProfesor } from './informe'
import { articulosPorSemana, destinos, modelosDisponibles, proveedorBusqueda } from './config'
import { publicacionConfigurada } from './wordnext'

export interface MarketingMetrics {
  destinos: { destino: string; porSemana: number }[]
  configuracion: { modelos: boolean; publicacion: boolean; busqueda: string }
  temas: (Tema & { piezas: Pieza[]; informe: InformeProfesor | null })[]
}

/** Lo que pinta la pestaña Marketing: los últimos 400 temas (los archivados solo si se piden) con sus piezas en WordNext. */
export async function marketingMetrics(opts: { archivados?: boolean } = {}): Promise<MarketingMetrics> {
  const temas = await marketingStoreDb.recientes(400, opts.archivados)
  // Informe del Profesor: el de su redacción si la hubo; si no, el del plan que lo propuso.
  const informes = await informesDe(temas.filter((t) => t.estado !== 'archivado' && t.estado !== 'descartado').flatMap((t) => [t.sessionId, t.planSessionId]), { leerSesion })
  const conPiezas = await Promise.all(
    temas.map(async (t) => ({
      ...t,
      // Las piezas solo importan donde hay artículos enviados: evita una consulta por cada tema propuesto o archivado.
      piezas: ['redactando', 'en_revision', 'publicado', 'rechazado', 'vetado', 'fallido'].includes(t.estado) ? await marketingStoreDb.piezasDeTema(t.id, t.version) : [],
      informe: (t.sessionId ? informes[t.sessionId] : undefined) ?? (t.planSessionId ? informes[t.planSessionId] : undefined) ?? null,
    })),
  )
  return {
    destinos: destinos().map((destino) => ({ destino, porSemana: articulosPorSemana(process.env, destino) })),
    configuracion: { modelos: modelosDisponibles(), publicacion: publicacionConfigurada(), busqueda: proveedorBusqueda() },
    temas: conPiezas,
  }
}
