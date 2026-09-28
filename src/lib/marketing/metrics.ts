import type { Pieza, Tema } from '@/db/marketing'
import { leerSesion, marketingStoreDb } from './store'
import { informesDe } from './ciclo'
import type { InformeProfesor } from './informe'
import { articulosPorSemana, destinos, modelosDisponibles, proveedorBusqueda } from './config'
import { publicacionConfigurada } from './wordnext'

export interface MarketingMetrics {
  destinos: string[]
  porSemana: number
  configuracion: { modelos: boolean; publicacion: boolean; busqueda: string }
  temas: (Tema & { piezas: Pieza[]; informe: InformeProfesor | null })[]
}

/** Lo que pinta la pestaña Marketing: los últimos 60 temas con sus piezas en WordNext. */
export async function marketingMetrics(): Promise<MarketingMetrics> {
  const temas = await marketingStoreDb.recientes(60)
  // Informe del Profesor: el de su redacción si la hubo; si no, el del plan que lo propuso.
  const informes = await informesDe(temas.flatMap((t) => [t.sessionId, t.planSessionId]), { leerSesion })
  const conPiezas = await Promise.all(
    temas.map(async (t) => ({
      ...t,
      piezas: await marketingStoreDb.piezasDeTema(t.id, t.version),
      informe: (t.sessionId ? informes[t.sessionId] : undefined) ?? (t.planSessionId ? informes[t.planSessionId] : undefined) ?? null,
    })),
  )
  return {
    destinos: destinos(),
    porSemana: articulosPorSemana(),
    configuracion: { modelos: modelosDisponibles(), publicacion: publicacionConfigurada(), busqueda: proveedorBusqueda() },
    temas: conPiezas,
  }
}
