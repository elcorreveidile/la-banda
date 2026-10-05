/**
 * Validación DURA (en código, no en el prompt) de lo que La Banda manda al sondeo.
 * Es lo que impide que un bulo, una noticia sin fuentes o una cifra de sondeo en veda salgan
 * por descuido del modelo: `enviarPieza` y `enviarVerificacion` no mandan nada que no pase aquí.
 */

import { normalizarPayload } from '@/engine/decision'
import type { TipoPoliticaPieza } from '@/db/politica'
import { enVeda } from './config'
import { mencionaCifrasDeSondeos } from './veda'

export const VEREDICTOS = ['verificado', 'mayormente-cierto', 'enganoso', 'falso', 'sin-pruebas'] as const
export type Veredicto = (typeof VEREDICTOS)[number]

export interface Fuente {
  titulo: string
  url: string
}

export interface Verificacion {
  veredicto: Veredicto
  resumen: string
  fuentes: Fuente[]
}

export interface PiezaValida {
  titulo: string
  slug: string
  extracto: string
  markdown: string
  verificacion: Verificacion
}

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const texto = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Webs oficiales: una fuente de estas basta como fuente primaria. */
const PRIMARIAS = [/(^|\.)boe\.es$/, /(^|\.)congreso\.es$/, /(^|\.)senado\.es$/, /\.gob\.es$/, /(^|\.)europa\.eu$/, /(^|\.)poderjudicial\.es$/, /(^|\.)ine\.es$/, /(^|\.)tribunalconstitucional\.es$/, /(^|\.)juntaelectoralcentral\.es$/, /(^|\.)cis\.es$/]

function anfitrion(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

export const esFuentePrimaria = (url: string): boolean => {
  const h = anfitrion(url)
  return !!h && PRIMARIAS.some((r) => r.test(h))
}

/** Dominio «registrable» aproximado (últimas dos etiquetas): basta para contar fuentes independientes. */
const dominio = (url: string): string | null => anfitrion(url)?.split('.').slice(-2).join('.') ?? null

export function leerFuentes(v: unknown): Fuente[] {
  const fuentes: Fuente[] = []
  const vistas = new Set<string>()
  for (const f of (Array.isArray(v) ? v : []).slice(0, 12)) {
    if (!esObjeto(f)) continue
    const url = typeof f.url === 'string' ? f.url.trim() : ''
    if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 500 || vistas.has(url)) continue
    vistas.add(url)
    fuentes.push({ titulo: texto(f.titulo, 160) || (anfitrion(url) ?? url), url })
  }
  return fuentes
}

export function validarVerificacion(v: unknown): { ok: true; verificacion: Verificacion } | { ok: false; errores: string[] } {
  const e = normalizarPayload(v)
  if (!esObjeto(e)) return { ok: false, errores: ['falta el objeto de verificación'] }
  const errores: string[] = []
  const veredicto = VEREDICTOS.find((x) => x === e.veredicto)
  if (!veredicto) errores.push(`veredicto no válido (uno de: ${VEREDICTOS.join(', ')})`)
  const resumen = texto(e.resumen, 1500)
  if (resumen.length < 20) errores.push('el resumen del veredicto debe explicar el porqué (mínimo 20 caracteres)')
  const fuentes = leerFuentes(e.fuentes)
  if (veredicto && veredicto !== 'sin-pruebas') {
    if (fuentes.length === 0) errores.push('un veredicto necesita al menos una fuente con enlace https')
    // Dar algo por cierto o por falso exige fuente primaria o dos fuentes independientes entre sí.
    else if (!fuentes.some((f) => esFuentePrimaria(f.url)) && new Set(fuentes.map((f) => dominio(f.url))).size < 2) {
      errores.push('falta una fuente primaria (BOE, Congreso, Moncloa, comunicado oficial…) o una segunda fuente de otro medio')
    }
  }
  if (errores.length || !veredicto) return { ok: false, errores }
  return { ok: true, verificacion: { veredicto, resumen, fuentes } }
}

export function contarPalabras(md: string): number {
  return md.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
}

const PALABRAS_MIN = 100
const PALABRAS_MAX = 1600

/** Problemas del Markdown que el sondeo recibe (solo admite una lista blanca y escapa el resto). */
export function problemasMarkdown(md: string): string[] {
  const p: string[] = []
  if (/<\/?[a-zA-Z!]/.test(md)) p.push('no se admite HTML: solo Markdown (títulos #, listas -, **negrita**, *cursiva*, > cita, [texto](https://…))')
  if (/!\[[^\]]*\]\(/.test(md)) p.push('no se admiten imágenes')
  for (const m of md.matchAll(/\]\(([^)\s]*)\)/g)) {
    if (!/^(https?:\/\/|\/[^/])/i.test(m[1])) p.push(`enlace no válido: ${m[1].slice(0, 60)}`)
  }
  if (/^\s*#\s/m.test(md)) p.push('no pongas título de primer nivel (#): el título ya es el de la entrada; usa ## y ###')
  return [...new Set(p)]
}

export interface OpcionesPieza {
  tipo: TipoPoliticaPieza
  /** Hora propuesta de publicación: si cae en la veda, no puede citar cifras de sondeos. */
  programadoPara: Date | null
}

export function validarPieza(v: unknown, o: OpcionesPieza): { ok: true; pieza: PiezaValida } | { ok: false; errores: string[] } {
  const e = normalizarPayload(v)
  if (!esObjeto(e)) return { ok: false, errores: ['falta la pieza'] }
  const errores: string[] = []
  const titulo = texto(e.titulo, 200)
  if (titulo.length < 10 || titulo.length > 160) errores.push('titulo: 10-160 caracteres')
  const extracto = texto(e.extracto, 400)
  if (extracto.length < 50 || extracto.length > 300) errores.push('extracto: 50-300 caracteres')
  const markdown = typeof e.markdown === 'string' ? e.markdown.replace(/\r\n/g, '\n').trim() : ''
  const palabras = contarPalabras(markdown)
  if (palabras < PALABRAS_MIN || palabras > PALABRAS_MAX) errores.push(`markdown: ${PALABRAS_MIN}-${PALABRAS_MAX} palabras (tiene ${palabras})`)
  errores.push(...problemasMarkdown(markdown))
  const slug = texto(e.slug, 80).toLowerCase()
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errores.push('slug: minúsculas, números y guiones')

  const ver = validarVerificacion(e.verificacion)
  if (!ver.ok) errores.push(...ver.errores.map((x) => `verificacion: ${x}`))
  else if ((o.tipo === 'edicion' || o.tipo === 'extra') && (ver.verificacion.veredicto === 'falso' || ver.verificacion.veredicto === 'enganoso')) {
    errores.push('verificacion: un parte o un extra cuenta hechos verificados; lo falso o engañoso va en una pieza de tipo bulo (o como desmentido dentro de un parte verificado)')
  }

  if (o.programadoPara && enVeda(o.programadoPara)) {
    const todo = [titulo, extracto, markdown, ver.ok ? ver.verificacion.resumen : ''].join('\n')
    if (mencionaCifrasDeSondeos(todo)) errores.push('veda electoral: la pieza sale entre el 24 y el 29 de noviembre y cita cifras de encuestas o sondeos')
  }

  if (errores.length || !ver.ok) return { ok: false, errores }
  return { ok: true, pieza: { titulo, slug, extracto, markdown, verificacion: ver.verificacion } }
}

/** El campo más reciente del dossier que pasa `leer` (los traspasos van de la más reciente a la más antigua). */
export function ultimoDelDossier<T>(dossier: unknown[], campo: string, leer: (v: unknown) => T | null): T | null {
  for (const p of dossier) {
    const e = normalizarPayload(p)
    const v = esObjeto(e) ? normalizarPayload(e[campo]) : undefined
    const r = leer(v)
    if (r !== null) return r
  }
  return null
}

export interface PiezaEnDossier {
  presente: boolean
  titulo: string | null
  palabras: number
  /** Lo que falla en la validación dura del envío (vacío = pasaría). */
  errores: string[]
}

/** La versión MÁS RECIENTE de `pieza` del dossier, con sus palabras contadas y los errores de validación. */
export function piezaDelDossier(dossier: unknown[], o: OpcionesPieza): PiezaEnDossier {
  for (const p of dossier) {
    const e = normalizarPayload(p)
    const v = esObjeto(e) ? normalizarPayload(e.pieza) : undefined
    if (!esObjeto(v)) continue
    const md = typeof v.markdown === 'string' ? v.markdown : ''
    const r = validarPieza(v, o)
    return { presente: true, titulo: texto(v.titulo, 200) || null, palabras: contarPalabras(md), errores: r.ok ? [] : r.errores }
  }
  return { presente: false, titulo: null, palabras: 0, errores: ['no hay "pieza" en el dossier'] }
}
