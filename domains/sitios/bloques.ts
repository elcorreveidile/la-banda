/**
 * Vocabulario CERRADO de bloques que la banda puede emitir (subset del modelo de
 * contenido de WordNext, `src/types/blocks.ts` de wp-next-starter) y las reglas del
 * encargo (kinds, slugs, nº de páginas). La validación DURA se hace aquí, en código:
 * ni Berlín ni Palermo sustituyen a estas comprobaciones.
 *
 * Para el modo estático define además el esqueleto del paquete (rutas, límites).
 */

export const KINDS = ['PAGE', 'HOME', 'LEGAL', 'LANDING'] as const
export type KindPagina = (typeof KINDS)[number]

export const MIN_PAGINAS = 4
export const MAX_PAGINAS = 8
export const MAX_BLOQUES_POR_PAGINA = 40
/** Tope de tamaño de una página HTML del paquete estático. */
export const MAX_HTML_BYTES = 40_000
export const MAX_CSS_BYTES = 30_000

const URL_ABSOLUTA = /^https:\/\/\S+$/
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const PATH_HTML = /^[a-z0-9-]+\.html$/

export interface BloqueValido {
  type: string
  [campo: string]: unknown
}

export interface PaginaValida {
  titulo: string
  slug: string
  kind: KindPagina
  blocks: BloqueValido[]
}

type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: string }

const esTexto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/** El título de una página del borrador de Río: «titulo» (como lo pide el prompt) o «title». */
const tituloDe = (raw: Record<string, unknown>): string => (esTexto(raw.titulo) ? raw.titulo : esTexto(raw.title) ? raw.title : '').trim()

/** Valida UN bloque contra el vocabulario cerrado. Los campos desconocidos se quitan. */
export function validarBloque(b: unknown): Resultado<BloqueValido> {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, motivo: 'bloque no es un objeto' }
  const raw = b as Record<string, unknown>
  const type = raw.type
  const campo = <T>(nombre: string, validar: (v: unknown) => v is T): T | undefined => (validar(raw[nombre]) ? raw[nombre] : undefined)
  const opcional = <T>(nombre: string, validar: (v: unknown) => v is T): T | null | undefined => (raw[nombre] === null ? null : campo(nombre, validar))

  switch (type) {
    case 'hero': {
      if (!esTexto(raw.title)) return { ok: false, motivo: 'hero sin title' }
      const bloque: BloqueValido = { type, title: raw.title.trim() }
      if (esTexto(raw.subtitle)) bloque.subtitle = raw.subtitle.trim()
      if (esTexto(raw.titleAccent) && String(raw.title).trim().startsWith(String(raw.titleAccent).trim())) bloque.titleAccent = String(raw.titleAccent).trim()
      if (esTexto(raw.ctaText)) {
        bloque.ctaText = raw.ctaText.trim()
        const href = opcional('ctaHref', (v): v is string => typeof v === 'string' && (v.startsWith('/') || URL_ABSOLUTA.test(v)))
        if (href) bloque.ctaHref = href
      }
      return { ok: true, valor: bloque }
    }
    case 'heading': {
      if (!esTexto(raw.text)) return { ok: false, motivo: 'heading sin text' }
      const level = typeof raw.level === 'number' && raw.level >= 1 && raw.level <= 6 ? Math.round(raw.level) : 2
      return { ok: true, valor: { type, level, text: raw.text.trim() } }
    }
    case 'paragraph': {
      if (!esTexto(raw.text)) return { ok: false, motivo: 'paragraph sin text' }
      const bloque: BloqueValido = { type, text: raw.text.trim() }
      if (raw.align === 'center' || raw.align === 'right') bloque.align = raw.align
      if (raw.size === 'sm' || raw.size === 'lg' || raw.size === 'xl') bloque.size = raw.size
      return { ok: true, valor: bloque }
    }
    case 'list': {
      if (!Array.isArray(raw.items) || !raw.items.length || !raw.items.every(esTexto)) return { ok: false, motivo: 'list sin items de texto' }
      const bloque: BloqueValido = { type, items: (raw.items as string[]).map((i) => i.trim()) }
      if (raw.ordered === true) bloque.ordered = true
      return { ok: true, valor: bloque }
    }
    case 'image': {
      if (!esTexto(raw.src) || !URL_ABSOLUTA.test(raw.src.trim())) return { ok: false, motivo: 'image sin src https absoluta' }
      const bloque: BloqueValido = { type, src: raw.src.trim() }
      if (esTexto(raw.alt)) bloque.alt = raw.alt.trim()
      return { ok: true, valor: bloque }
    }
    case 'blurb': {
      if (!esTexto(raw.title) || !esTexto(raw.desc)) return { ok: false, motivo: 'blurb sin title o desc' }
      const bloque: BloqueValido = { type, title: raw.title.trim(), desc: raw.desc.trim() }
      if (esTexto(raw.img) && URL_ABSOLUTA.test(raw.img.trim())) bloque.img = raw.img.trim()
      return { ok: true, valor: bloque }
    }
    case 'button': {
      if (!esTexto(raw.text)) return { ok: false, motivo: 'button sin text' }
      const bloque: BloqueValido = { type, text: raw.text.trim() }
      const href = opcional('href', (v): v is string => typeof v === 'string' && (v.startsWith('/') || URL_ABSOLUTA.test(v)))
      if (href) bloque.href = href
      return { ok: true, valor: bloque }
    }
    case 'quote': {
      if (!esTexto(raw.text)) return { ok: false, motivo: 'quote sin text' }
      const bloque: BloqueValido = { type, text: raw.text.trim() }
      if (esTexto(raw.source)) bloque.source = raw.source.trim()
      return { ok: true, valor: bloque }
    }
    default:
      return { ok: false, motivo: `tipo de bloque fuera del vocabulario: ${String(type)}` }
  }
}

export function slugificar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

/** Valida una lista de páginas del borrador de Río (modo wordnext). Descarta las malas. */
export function validarPaginas(input: unknown[]): { paginas: PaginaValida[]; descartes: string[] } {
  const paginas: PaginaValida[] = []
  const descartes: string[] = []
  const slugs = new Set<string>()

  for (let i = 0; i < input.length && paginas.length < MAX_PAGINAS; i++) {
    const raw = input[i] as Record<string, unknown>
    const donde = `páginas[${i}]`
    if (!raw || typeof raw !== 'object') {
      descartes.push(`${donde}: no es un objeto`)
      continue
    }
    const titulo = tituloDe(raw)
    if (!titulo) {
      descartes.push(`${donde}: sin título`)
      continue
    }
    const slug = esTexto(raw.slug) && SLUG.test(raw.slug.trim()) ? raw.slug.trim() : slugificar(titulo)
    if (!slug || slugs.has(slug)) {
      descartes.push(`${donde}: slug vacío o repetido (${slug || titulo})`)
      continue
    }
    const kind = (KINDS as readonly string[]).includes(String(raw.kind)) ? (raw.kind as KindPagina) : 'PAGE'
    const bloquesCrudos = Array.isArray(raw.blocks) ? raw.blocks.slice(0, MAX_BLOQUES_POR_PAGINA) : []
    if (!bloquesCrudos.length) {
      descartes.push(`${donde} (${slug}): sin bloques`)
      continue
    }
    const blocks: BloqueValido[] = []
    for (let j = 0; j < bloquesCrudos.length; j++) {
      const r = validarBloque(bloquesCrudos[j])
      if (r.ok) blocks.push(r.valor)
      else descartes.push(`${donde} (${slug}) bloques[${j}]: ${r.motivo}`)
    }
    if (!blocks.length) {
      descartes.push(`${donde} (${slug}): todos los bloques inválidos`)
      continue
    }
    slugs.add(slug)
    paginas.push({ titulo, slug, kind, blocks })
  }

  // Un solo HOME: el primero se queda, el resto bajan a PAGE.
  let hayHome = false
  for (const p of paginas) {
    if (p.kind === 'HOME') {
      if (hayHome) p.kind = 'PAGE'
      else hayHome = true
    }
  }
  return { paginas, descartes }
}

export interface PaginaEstatica {
  path: string
  titulo: string
  html: string
}

/** Valida el borrador HTML (modo estático): rutas sanas, tamaño, enlaces internos existentes. */
export function validarPaginasEstaticas(input: unknown[]): { paginas: PaginaEstatica[]; descartes: string[] } {
  const paginas: PaginaEstatica[] = []
  const descartes: string[] = []
  const rutas = new Set<string>()

  for (let i = 0; i < input.length && paginas.length < MAX_PAGINAS; i++) {
    const raw = input[i] as Record<string, unknown>
    const donde = `páginas[${i}]`
    if (!raw || typeof raw !== 'object') {
      descartes.push(`${donde}: no es un objeto`)
      continue
    }
    const path = esTexto(raw.path) && PATH_HTML.test(raw.path.trim()) ? raw.path.trim() : ''
    if (!path) {
      descartes.push(`${donde}: path inválido (esperado algo.html en minúsculas)`)
      continue
    }
    if (rutas.has(path)) {
      descartes.push(`${donde}: ruta repetida (${path})`)
      continue
    }
    const html = esTexto(raw.html) ? raw.html.trim() : ''
    if (!html) {
      descartes.push(`${donde} (${path}): html vacío`)
      continue
    }
    if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
      descartes.push(`${donde} (${path}): html supera ${MAX_HTML_BYTES} bytes`)
      continue
    }
    rutas.add(path)
    paginas.push({ path, titulo: tituloDe(raw) || path, html })
  }

  // Enlaces internos rotos: aviso, no descarte (no rompen la entrega).
  for (const p of paginas) {
    for (const m of p.html.matchAll(/href="([a-z0-9-]+\.html)"/g)) {
      if (!rutas.has(m[1])) descartes.push(`${p.path}: enlace interno roto a ${m[1]}`)
    }
  }
  if (paginas.length && !rutas.has('index.html')) descartes.push('falta index.html: la primera página se servirá como index')
  return { paginas, descartes }
}
