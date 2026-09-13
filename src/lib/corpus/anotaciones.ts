/**
 * Anotaciones del corpus: normalización, fusión y filtrado contra el etiquetario.
 * Funciones PURAS (sin red ni base de datos): las usan las herramientas de Helsinki
 * (escribirPieza, escribirAnotaciones) y se testean solas.
 *
 * Lección de la primera muestra («bar», A2): los agentes escribían el código con el
 * prefijo de capa ("codigo": "funcion:f5-saludar-despedir"), Nairobi perdió por el camino
 * el array corregido de Berlín y, ante un 400 de la Clínica, Helsinki lo tiró todo.
 */

import type { AnotacionCorpus, Etiquetario } from '@/lib/clinica'

export interface AnotacionDescartada {
  capa: string
  codigo: string
  motivo: string
}

const CAPAS = ['nivel', 'funcion', 'gramatica', 'lexico', 'pragmatica', 'cultura', 'fonetica', 'error']

function entero(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** Capa y código limpios: minúsculas, sin espacios y sin el prefijo `capa:` en el código. null si no es una anotación. */
export function normalizarAnotacion(a: unknown): AnotacionCorpus | null {
  if (!a || typeof a !== 'object') return null
  const o = a as Record<string, unknown>
  let capa = String(o.capa ?? '').trim().toLowerCase()
  let codigo = String(o.codigo ?? '').trim().toLowerCase()
  if (!codigo) return null
  // "funcion:f5-saludar" → capa funcion, codigo f5-saludar (también si la capa venía vacía o distinta).
  const dos = codigo.indexOf(':')
  if (dos > 0) {
    const pre = codigo.slice(0, dos)
    if (CAPAS.includes(pre)) {
      if (!capa || capa === pre) capa = pre
      codigo = codigo.slice(dos + 1).trim()
    }
  }
  if (!capa || !codigo) return null
  const inicio = entero(o.inicio)
  const fin = entero(o.fin)
  const spanValido = inicio !== null && fin !== null && fin > inicio
  const nota = typeof o.nota === 'string' && o.nota.trim() ? o.nota.trim().slice(0, 1000) : null
  return { capa, codigo, inicio: spanValido ? inicio : null, fin: spanValido ? fin : null, nota }
}

const clave = (a: AnotacionCorpus) => `${a.capa}|${a.codigo}|${a.inicio ?? ''}|${a.fin ?? ''}`

/** Unión de varias listas (normalizadas), sin duplicados por capa+código+span, ordenadas por posición. */
export function fusionarAnotaciones(listas: unknown[][], max = 60): AnotacionCorpus[] {
  const vistas = new Map<string, AnotacionCorpus>()
  for (const lista of listas) {
    for (const item of lista) {
      const a = normalizarAnotacion(item)
      if (!a) continue
      const k = clave(a)
      const previa = vistas.get(k)
      // Si ya estaba, conservar la nota más larga.
      if (!previa || (a.nota?.length ?? 0) > (previa.nota?.length ?? 0)) vistas.set(k, a)
    }
  }
  return Array.from(vistas.values())
    .sort((x, y) => (x.inicio ?? Number.MAX_SAFE_INTEGER) - (y.inicio ?? Number.MAX_SAFE_INTEGER) || x.capa.localeCompare(y.capa) || x.codigo.localeCompare(y.codigo))
    .slice(0, max)
}

/** Separa las anotaciones cuyo capa+código existe en el etiquetario de las que no. */
export function filtrarPorEtiquetario(items: AnotacionCorpus[], etiquetario: Etiquetario): { validas: AnotacionCorpus[]; descartadas: AnotacionDescartada[] } {
  const validos = new Set(etiquetario.etiquetas.map((e) => `${e.capa}:${e.codigo}`))
  const validas: AnotacionCorpus[] = []
  const descartadas: AnotacionDescartada[] = []
  for (const a of items) {
    if (validos.has(`${a.capa}:${a.codigo}`)) validas.push(a)
    else descartadas.push({ capa: a.capa, codigo: a.codigo, motivo: 'no está en el etiquetario' })
  }
  return { validas, descartadas }
}

/** Quita las anotaciones cuyo `capa:codigo` figura en `invalidas` (lo que devuelve la Clínica en un 400). */
export function quitarInvalidas(items: AnotacionCorpus[], invalidas: unknown): { validas: AnotacionCorpus[]; descartadas: AnotacionDescartada[] } {
  const malas = new Set((Array.isArray(invalidas) ? invalidas : []).map((x) => String(x).trim().toLowerCase()))
  const validas: AnotacionCorpus[] = []
  const descartadas: AnotacionDescartada[] = []
  for (const a of items) {
    if (malas.has(`${a.capa}:${a.codigo}`) || malas.has(a.codigo)) descartadas.push({ capa: a.capa, codigo: a.codigo, motivo: 'rechazado por la Clínica' })
    else validas.push(a)
  }
  return { validas, descartadas }
}

const CAMPOS_DOSSIER = ['anotacionesBerlin', 'anotacionesLisboa', 'anotacionesRio', 'anotaciones']

/**
 * Recoge las listas de anotaciones que viajan en los payloads del dossier (traspasos de
 * la tarea, del más reciente al más antiguo): `anotacionesBerlin`, `anotacionesLisboa`,
 * `ficha.anotaciones`… Para cada campo se toma SOLO la versión más reciente (la de la
 * última corrección), no todas las versiones.
 */
export function extraerAnotacionesDelDossier(payloadsRecientesPrimero: unknown[]): unknown[][] {
  const vistos = new Set<string>()
  const out: unknown[][] = []
  const mirar = (obj: Record<string, unknown>, prefijo: string) => {
    for (const campo of CAMPOS_DOSSIER) {
      const v = obj[campo]
      const k = `${prefijo}${campo}`
      if (Array.isArray(v) && v.length && !vistos.has(k)) {
        vistos.add(k)
        out.push(v)
      }
    }
  }
  for (const p of payloadsRecientesPrimero) {
    if (!p || typeof p !== 'object') continue
    const o = p as Record<string, unknown>
    mirar(o, '')
    const ficha = o.ficha
    if (ficha && typeof ficha === 'object') mirar(ficha as Record<string, unknown>, 'ficha.')
  }
  return out
}
