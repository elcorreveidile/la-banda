import type { PiezaPolitica } from '@/db/politica'
import { diaMadrid, EDICIONES, publicaEn } from './calendario'
import { modelosDisponibles, rangoEdiciones } from './config'
import { sondeoConfigurado } from './cliente'
import { politicaStoreDb } from './store'

export interface PoliticaMetrics {
  piezas: PiezaPolitica[]
  /** Las tres ediciones de hoy y su pieza (si ya se abrió). */
  hoy: { dia: string; ediciones: { id: string; label: string; publica: Date; pieza: PiezaPolitica | null }[] }
  rango: { desde: string; hasta: string }
  configuracion: { modelos: boolean; sondeo: boolean }
}

export async function politicaMetrics(opts: { archivadas?: boolean } = {}): Promise<PoliticaMetrics> {
  const dia = diaMadrid(new Date())
  const [piezas, delDia] = await Promise.all([politicaStoreDb.recientes(80, opts.archivadas), politicaStoreDb.delDia(dia)])
  return {
    piezas,
    hoy: {
      dia,
      ediciones: EDICIONES.map((e) => ({
        id: e.id,
        label: e.label,
        publica: publicaEn(dia, e.id),
        pieza: delDia.filter((p) => p.tipo === 'edicion' && p.edicion === e.id).sort((a, b) => b.version - a.version)[0] ?? null,
      })),
    },
    rango: rangoEdiciones(),
    configuracion: { modelos: modelosDisponibles(), sondeo: sondeoConfigurado() },
  }
}
