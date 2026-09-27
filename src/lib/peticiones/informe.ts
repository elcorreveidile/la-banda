/**
 * Composición del informe de una petición DESDE EL DOSSIER (los payloads de los
 * traspasos de la tarea), no desde lo que diga el modelo en la llamada. La usa
 * la herramienta registrarInforme de Helsinki y el cron como guarda de huecos
 * (sesión cerrada con finalReport pero fila sin informe).
 */

import { quitarCitas } from '@/lib/limpiar'

export interface InformePeticion {
  titulo: string
  resumenEjecutivo: string | null
  cuerpo: string
  criterios: unknown | null
  verificacion: unknown | null
  veredictoPalermo: unknown | null
  generadoAt: string
}

const campo = (p: unknown, nombre: string): unknown => (p && typeof p === 'object' ? (p as Record<string, unknown>)[nombre] : undefined)

/** Última versión no vacía de un campo de texto en el dossier (del más reciente al más antiguo). */
function ultimo<T>(payloads: unknown[], nombre: string, validar: (v: unknown) => T | null): T | null {
  for (const p of payloads) {
    const v = validar(campo(p, nombre))
    if (v !== null) return v
  }
  return null
}

const textoNoVacio = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Compone el informe desde el dossier: el borrador de Río (informeBorrador.cuerpo) es
 * imprescindible; lo demás (resumen de Nairobi, criterios de Estocolmo, verificación de
 * Berlín, veredicto de Palermo) se añade si está. null si falta el borrador.
 */
export function componerInformeDesdeDossier(payloads: unknown[], titulo: string): InformePeticion | null {
  const borrador = ultimo(payloads, 'informeBorrador', (v) => {
    if (!v || typeof v !== 'object') return null
    const cuerpo = textoNoVacio(campo(v, 'cuerpo'))
    if (!cuerpo) return null
    return { titulo: textoNoVacio(campo(v, 'titulo')), cuerpo, recomendaciones: campo(v, 'recomendaciones') ?? null }
  })
  if (!borrador) return null
  const resumen = ultimo(payloads, 'resumenEjecutivo', textoNoVacio)
  return {
    titulo: quitarCitas(borrador.titulo || titulo),
    resumenEjecutivo: resumen ? quitarCitas(resumen) : null,
    cuerpo: quitarCitas(borrador.cuerpo),
    criterios: ultimo(payloads, 'criterios', (v) => (Array.isArray(v) && v.length ? v : null)),
    verificacion: ultimo(payloads, 'verificacion', (v) => (v && typeof v === 'object' ? v : null)),
    veredictoPalermo: ultimo(payloads, 'veredictoPalermo', (v) => (v && typeof v === 'object' ? v : null)),
    generadoAt: new Date().toISOString(),
  }
}

/**
 * Guarda de huecos: la sesión cerró con finalReport pero Helsinki no llegó a registrar
 * el informe (p. ej. salida cortada). El payload del close del Profesor lleva
 * { resultado, titulo, resumenEjecutivo, informe }.
 */
export function componerInformeDesdeFinalReport(finalReport: unknown, titulo: string): InformePeticion | null {
  if (!finalReport || typeof finalReport !== 'object') return null
  const cuerpo = textoNoVacio(campo(finalReport, 'informe'))
  if (!cuerpo) return null
  const resumen = textoNoVacio(campo(finalReport, 'resumenEjecutivo'))
  return {
    titulo: quitarCitas(textoNoVacio(campo(finalReport, 'titulo')) || titulo),
    resumenEjecutivo: resumen ? quitarCitas(resumen) : null,
    cuerpo: quitarCitas(cuerpo),
    criterios: null,
    verificacion: null,
    veredictoPalermo: campo(finalReport, 'veredictoPalermo') ?? null,
    generadoAt: new Date().toISOString(),
  }
}
