/**
 * Informe del Profesor: cierre de cada mesa de marketing (plan o artículo). Resume lo que hizo la
 * banda para la revisión del domingo: qué quedó, con qué fuentes, qué objetó Palermo y qué debería
 * mirar Javier antes de aprobar. Se lee del `finalReport` de la sesión (sin columnas nuevas). Puro.
 */

export interface InformeProfesor {
  resumen: string
  fuentes: string[]
  objeciones: string[]
  revisar: string[]
  devoluciones: number
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const lista = (v: unknown, max: number, tope: number) =>
  (Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v] : [])
    .map((x) => txt(x, max))
    .filter(Boolean)
    .slice(0, tope)

/** Solo fuentes https (el informe viaja a un correo y al panel como enlaces). */
function fuentesSeguras(v: unknown): string[] {
  return lista(v, 500, 8).filter((u) => {
    try {
      return new URL(u).protocol === 'https:'
    } catch {
      return false
    }
  })
}

/** Saca el informe del payload de cierre del Profesor. Null si no hay (mesa vetada, fallida o anterior al Profesor). */
export function leerInforme(finalReport: unknown): InformeProfesor | null {
  const inf = obj(obj(finalReport)?.informe)
  if (!inf) return null
  const resumen = txt(inf.resumen, 800)
  const revisar = lista(inf.revisar, 300, 4)
  if (!resumen && !revisar.length) return null
  const dev = Number(inf.devoluciones)
  return {
    resumen,
    fuentes: fuentesSeguras(inf.fuentes),
    objeciones: lista(inf.objeciones, 300, 6),
    revisar,
    devoluciones: Number.isFinite(dev) && dev > 0 ? Math.min(Math.floor(dev), 99) : 0,
  }
}

/** Resultado y motivo del cierre: los copia el Profesor, y si no, se leen del «envio» de Helsinki. */
export function resultadoDeCierre(finalReport: unknown): { resultado: string; motivo: string } {
  const r = obj(finalReport) ?? {}
  const envio = obj(r.envio) ?? {}
  const t = (v: unknown) => (typeof v === 'string' ? v : v ? JSON.stringify(v) : '')
  return {
    resultado: t(r.resultado) || t(envio.resultado),
    motivo: t(r.motivo) || t(r.razon) || t(r.reason) || t(envio.motivo),
  }
}
