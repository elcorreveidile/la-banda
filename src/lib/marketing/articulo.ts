/**
 * Validación DURA (en código) de lo que produce la banda en el dominio marketing: los temas
 * de un plan y cada versión de un artículo. Ni Palermo ni Helsinki sustituyen a esto: lo que no
 * pasa aquí no sale hacia WordNext. Puro, sin BD.
 */

import { normalizarPayload } from '@/engine/decision'
import { IDS_CATEGORIA } from './config'

const esObjeto = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))
const limpio = (v: unknown): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim() : '')

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// ─── Temas ─────────────────────────────────────────────────────────────────────

export interface TemaPropuesto {
  categoria: string
  titulo: string
  angulo: string
  publico: string | null
  palabrasClave: string[]
}

/** Valida la lista de temas de un plan. Descarta los malos (con motivo) y los repetidos. */
export const ANGULO_MAX = 400

/** Recorta a `max` caracteres por el último espacio y cierra con «…». */
export function recortar(t: string, max: number): string {
  if (t.length <= max) return t
  const corte = t.slice(0, max - 1)
  const espacio = corte.lastIndexOf(' ')
  return `${(espacio > max * 0.6 ? corte.slice(0, espacio) : corte).replace(/[\s,;:.\-–—]+$/, '')}…`
}

export function validarTemas(v: unknown, max: number, titulosExistentes: string[] = [], categoriasPermitidas?: string[]): { temas: TemaPropuesto[]; descartes: string[] } {
  const lista = Array.isArray(v) ? v : []
  const vistos = new Set(titulosExistentes.map(normalizarTitulo))
  const temas: TemaPropuesto[] = []
  const descartes: string[] = []
  for (const [i, x] of lista.entries()) {
    if (temas.length >= max) {
      descartes.push(`#${i + 1}: sobra (máximo ${max} por plan)`)
      continue
    }
    if (!esObjeto(x)) {
      descartes.push(`#${i + 1}: no es un objeto`)
      continue
    }
    const categoria = limpio(x.categoria)
    const titulo = limpio(x.titulo)
    // Un ángulo demasiado largo se recorta (no tira el tema): es texto para Javier y la mesa, no va al blog.
    const angulo = recortar(limpio(x.angulo), ANGULO_MAX)
    if (!IDS_CATEGORIA.has(categoria)) {
      descartes.push(`#${i + 1}: categoría desconocida «${categoria.slice(0, 40)}»`)
      continue
    }
    if (categoriasPermitidas && !categoriasPermitidas.includes(categoria)) {
      descartes.push(`#${i + 1}: la categoría «${categoria}» no es de este destino`)
      continue
    }
    if (titulo.length < 10 || titulo.length > 120) {
      descartes.push(`#${i + 1}: título de 10 a 120 caracteres`)
      continue
    }
    if (angulo.length < 20) {
      descartes.push(`#${i + 1}: ángulo de al menos 20 caracteres`)
      continue
    }
    const clave = normalizarTitulo(titulo)
    if (vistos.has(clave)) {
      descartes.push(`#${i + 1}: tema repetido («${titulo}»)`)
      continue
    }
    vistos.add(clave)
    const palabrasClave = (Array.isArray(x.palabrasClave) ? x.palabrasClave : [])
      .map(limpio)
      .filter((p) => p.length > 0 && p.length <= 60)
      .slice(0, 8)
    const publico = limpio(x.publico).slice(0, 200) || null
    temas.push({ categoria, titulo, angulo, publico, palabrasClave })
  }
  return { temas, descartes }
}

export function normalizarTitulo(t: string): string {
  return t
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// ─── Artículo ──────────────────────────────────────────────────────────────────

export interface ArticuloValido {
  titulo: string
  slug: string
  extracto: string
  seoTitulo: string
  seoDescripcion: string
  html: string
  palabras: number
}

export const ETIQUETAS_PERMITIDAS = new Set(['h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'a', 'blockquote', 'br'])
export const MIN_PALABRAS = 600
export const MAX_PALABRAS = 2500
export const MAX_HTML = 60_000

/** Palabras del texto visible de un HTML. */
export function contarPalabras(html: string): number {
  const texto = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .trim()
  return texto ? texto.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0
}

/**
 * Problemas del HTML: etiquetas fuera de la lista, atributos no permitidos y enlaces que no sean https ni una ruta interna
 * del propio destino («/curso»: los perfiles piden cerrar así, y funciona en cualquier dominio de la web).
 */
export function problemasHtml(html: string): string[] {
  const problemas = new Set<string>()
  const re = /<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*)>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const [, cierre, nombreBruto, attrs] = m
    const nombre = nombreBruto.toLowerCase()
    if (!ETIQUETAS_PERMITIDAS.has(nombre)) {
      problemas.add(`etiqueta no permitida <${nombre}>`)
      continue
    }
    if (cierre) continue
    const atributos = [...attrs.matchAll(/([a-zA-Z-:]+)\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+)/g)]
    for (const a of atributos) {
      const nombreAttr = a[1].toLowerCase()
      const valor = a[3] ?? a[4] ?? a[2]
      if (nombre === 'a' && nombreAttr === 'href') {
        if (!/^https:\/\/[^\s"'<>]+$/.test(valor) && !/^\/(?!\/)[^\s"'<>]*$/.test(valor)) problemas.add(`enlace no https ni ruta interna: ${valor.slice(0, 80)}`)
      } else {
        problemas.add(`atributo no permitido ${nombreAttr} en <${nombre}>`)
      }
    }
  }
  if (/<\s*h1\b/i.test(html)) problemas.add('sin <h1>: el título ya es el de la entrada')
  return [...problemas]
}

/** Valida una versión (ES o EN) de un artículo tal como la deja Río o Estocolmo en el dossier. */
export function validarArticulo(v: unknown): { ok: true; articulo: ArticuloValido } | { ok: false; errores: string[] } {
  if (!esObjeto(v)) return { ok: false, errores: ['falta el artículo'] }
  const errores: string[] = []
  const titulo = limpio(v.titulo)
  const slug = limpio(v.slug).toLowerCase()
  const extracto = limpio(v.extracto)
  const seoTitulo = limpio(v.seoTitulo) || titulo
  const seoDescripcion = limpio(v.seoDescripcion) || extracto
  const html = typeof v.html === 'string' ? v.html.trim() : ''

  if (titulo.length < 10 || titulo.length > 120) errores.push('título de 10 a 120 caracteres')
  if (!SLUG_RE.test(slug) || slug.length > 80) errores.push('slug en minúsculas-con-guiones (máx. 80)')
  if (extracto.length < 50 || extracto.length > 300) errores.push('extracto de 50 a 300 caracteres')
  if (seoTitulo.length > 70) errores.push('seoTitulo de 70 caracteres como mucho')
  if (seoDescripcion.length > 160) errores.push('seoDescripcion de 160 caracteres como mucho')
  if (!html) errores.push('falta el html')
  if (html.length > MAX_HTML) errores.push(`html de ${MAX_HTML} caracteres como mucho`)
  errores.push(...problemasHtml(html))
  const h2 = (html.match(/<\s*h2\b/gi) ?? []).length
  if (html && h2 < 2) errores.push('al menos dos secciones <h2>')
  const palabras = contarPalabras(html)
  if (html && (palabras < MIN_PALABRAS || palabras > MAX_PALABRAS)) errores.push(`entre ${MIN_PALABRAS} y ${MAX_PALABRAS} palabras (tiene ${palabras})`)

  if (errores.length) return { ok: false, errores }
  return { ok: true, articulo: { titulo, slug, extracto, seoTitulo, seoDescripcion, html, palabras } }
}

/** Veredicto de Palermo tal como lo deja en el dossier. */
export function leerVeredicto(v: unknown): { aprueba: boolean; motivos: string[] } | null {
  if (!esObjeto(v) || typeof v.aprueba !== 'boolean') return null
  const motivos = (Array.isArray(v.motivos) ? v.motivos : []).map(limpio).filter(Boolean).slice(0, 10)
  return { aprueba: v.aprueba, motivos }
}

export interface VersionEnDossier {
  presente: boolean
  titulo: string | null
  slug: string | null
  /** Palabras del texto visible, contadas por el código (no a ojo). */
  palabras: number
  /** Lo que falla en la validación dura del envío (vacío = pasaría). */
  errores: string[]
  html: string | null
}

/**
 * Las dos versiones MÁS RECIENTES del artículo que hay en el dossier (cargas de los traspasos, de la
 * más reciente a la más antigua), con recuento y validación hechos en código. Así Palermo y
 * Estocolmo no dependen de encontrar el campo en su traspaso ni de contar palabras a ojo. Puro.
 */
export function articulosDelDossier(dossier: unknown[]): { es: VersionEnDossier; en: VersionEnDossier } {
  const version = (campo: string): VersionEnDossier => {
    for (const bruto of dossier) {
      // Un traspaso o un campo que llegó como texto con JSON también cuenta (ver normalizarPayload).
      const p = normalizarPayload(bruto)
      const v = esObjeto(p) ? normalizarPayload(p[campo]) : undefined
      // Solo cuenta una versión con texto: si otro agente pisó el campo con una nota o un objeto
      // vacío, se sigue buscando la de quien la escribió.
      if (!esObjeto(v) || typeof v.html !== 'string' || !v.html.trim()) continue
      const html = v.html
      const r = validarArticulo(v)
      return { presente: true, titulo: limpio(v.titulo) || null, slug: limpio(v.slug) || null, palabras: html ? contarPalabras(html) : 0, errores: r.ok ? [] : r.errores, html }
    }
    return { presente: false, titulo: null, slug: null, palabras: 0, errores: ['no está en el dossier'], html: null }
  }
  return { es: version('articuloEs'), en: version('articuloEn') }
}
