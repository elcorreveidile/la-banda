import type { Pieza, Tema } from '@/db/marketing'
import { marketingStoreDb } from './store'
import { articulosPorSemana, destinos, modelosDisponibles, proveedorBusqueda } from './config'
import { publicacionConfigurada } from './wordnext'

export interface MarketingMetrics {
  destinos: string[]
  porSemana: number
  configuracion: { modelos: boolean; publicacion: boolean; busqueda: string }
  temas: (Tema & { piezas: Pieza[] })[]
}

/** Lo que pinta la pestaña Marketing: los últimos 60 temas con sus piezas en WordNext. */
export async function marketingMetrics(): Promise<MarketingMetrics> {
  const temas = await marketingStoreDb.recientes(60)
  const conPiezas = await Promise.all(temas.map(async (t) => ({ ...t, piezas: await marketingStoreDb.piezasDeTema(t.id, t.version) })))
  return {
    destinos: destinos(),
    porSemana: articulosPorSemana(),
    configuracion: { modelos: modelosDisponibles(), publicacion: publicacionConfigurada(), busqueda: proveedorBusqueda() },
    temas: conPiezas,
  }
}
