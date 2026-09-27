/**
 * Entrega DETERMINISTA del sitio (patrón writeLedger de trading / escribirPieza de
 * corpus): el código hace la entrega, no el modelo. La herramienta entregarSitio de
 * Helsinki solo la llama. Guardas: idempotencia (una entrega por sitio) y aprobación
 * de Palermo (la entrega externa es irreversible).
 */

import { asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { handoffs } from '@/db/schema'
import { siteForTask, setEntrega, setErrorEntrega, writeFiles } from './sites'
import { agregarPaginas, crearSitio, esError, type PaginaWordNext } from './wordnext'
import { MAX_CSS_BYTES, validarPaginas, validarPaginasEstaticas } from '@domains/sitios/bloques'
import { quitarCitas } from '@/lib/limpiar'
import type { EntregaSitio } from '@/db/sitios'

/** Payloads de los traspasos de la tarea, del más reciente al más antiguo. */
async function payloadsDeTarea(taskId: string): Promise<unknown[]> {
  try {
    const hs = await db.select({ payload: handoffs.payload }).from(handoffs).where(eq(handoffs.taskId, taskId)).orderBy(asc(handoffs.createdAt))
    return hs.map((h) => h.payload).reverse()
  } catch (err) {
    console.error('[la-banda] payloadsDeTarea', taskId, err)
    return []
  }
}

function ultimo<T>(payloads: unknown[], nombre: string, validar: (v: unknown) => T | null): T | null {
  for (const p of payloads) {
    const v = p && typeof p === 'object' ? (p as Record<string, unknown>)[nombre] : undefined
    const r = validar(v)
    if (r !== null) return r
  }
  return null
}

interface BorradorSitio {
  nombre: string | null
  tema: Record<string, unknown> | null
  paginasWordNext: unknown[]
  paginasEstaticas: unknown[]
  stylesCss: string | null
}

const esObjeto = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))

const leerBorrador = (v: unknown): BorradorSitio | null => {
  if (!esObjeto(v)) return null
  const paginas = Array.isArray(v.paginas) ? v.paginas : []
  if (!paginas.length && !esTexto(v.stylesCss)) return null
  return {
    nombre: esTexto(v.nombre) ? quitarCitas(v.nombre) : null,
    tema: esObjeto(v.tema) ? v.tema : null,
    paginasWordNext: paginas,
    paginasEstaticas: paginas,
    stylesCss: esTexto(v.stylesCss) ? v.stylesCss : null,
  }
}

const esTexto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

const leerVeredicto = (v: unknown): { aprueba: boolean; motivos: unknown } | null => {
  if (!esObjeto(v) || typeof v.aprueba !== 'boolean') return null
  return { aprueba: v.aprueba, motivos: v.motivos ?? null }
}

export interface ResultadoEntrega {
  entrega?: EntregaSitio
  error?: string
  sinBorrador?: boolean
  sinAprobacion?: boolean
}

/** Comprobación previa (para el prompt de Helsinki): ¿el dossier permite entregar? */
export async function estadoEntrega(taskId: string): Promise<{ sitioId: string; entrega: EntregaSitio | null; apruebaPalermo: boolean | null; hayBorrador: boolean }> {
  const site = await siteForTask(taskId)
  const payloads = await payloadsDeTarea(taskId)
  return {
    sitioId: site?.id ?? '',
    entrega: site?.entrega ?? null,
    apruebaPalermo: ultimo(payloads, 'veredictoPalermo', leerVeredicto)?.aprueba ?? null,
    hayBorrador: ultimo(payloads, 'sitioBorrador', leerBorrador) !== null,
  }
}

const CSS_BASE = `/* Hoja base del paquete estático generado por La Banda. Sustitúyela o ajústala a tu gusto. */
:root { --acento: #0f766e; --texto: #1c1917; --fondo: #fafaf9; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--texto); background: var(--fondo); line-height: 1.6; }
main { max-width: 60rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
h1, h2, h3 { line-height: 1.2; }
h1 { font-size: 2.2rem; margin: 0 0 1rem; }
h2 { font-size: 1.5rem; margin-top: 2.5rem; }
a { color: var(--acento); }
nav { display: flex; flex-wrap: wrap; gap: 1rem; padding: 1rem 1.25rem; border-bottom: 1px solid #e7e5e4; background: #fff; }
nav a { text-decoration: none; font-weight: 600; }
img { max-width: 100%; height: auto; border-radius: 0.5rem; }
blockquote { margin: 1.5rem 0; padding: 0.5rem 1.25rem; border-left: 4px solid var(--acento); background: #fff; font-style: italic; }
button, .boton { display: inline-block; padding: 0.6rem 1.2rem; border-radius: 0.5rem; border: 0; background: var(--acento); color: #fff; font-weight: 600; text-decoration: none; }
@media (max-width: 40rem) { h1 { font-size: 1.7rem; } main { padding: 1.25rem 1rem 3rem; } }
`

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function htmlConEsqueleto(path: string, titulo: string, html: string, menu: { path: string; titulo: string }[]): string {
  // Si el HTML de Río ya es un documento completo, se respeta; si es un fragmento, se envuelve.
  const nav = menu.length > 1 ? `<nav>${menu.map((m) => `<a href="${m.path}">${escapar(m.titulo)}</a>`).join('')}</nav>` : ''
  if (/<html[\s>]/i.test(html)) return html
  return `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escapar(titulo)}</title>\n<link rel="stylesheet" href="styles.css">\n</head>\n<body>\n${nav}\n<main>\n${html}\n</main>\n</body>\n</html>\n`
}

/** La entrega completa. Devuelve la entrega registrada o un error controlado (nunca lanza). */
export async function entregarSitio(taskId: string, now = new Date()): Promise<ResultadoEntrega> {
  const site = await siteForTask(taskId)
  if (!site) return { error: 'sitio no encontrado para esta tarea' }
  // Idempotencia: una sola entrega por sitio (los reintentos de sesión no duplican páginas).
  if (site.entrega) return { entrega: site.entrega }

  const payloads = await payloadsDeTarea(taskId)
  const veredicto = ultimo(payloads, 'veredictoPalermo', leerVeredicto)
  if (!veredicto?.aprueba) {
    const motivos = veredicto && !veredicto.aprueba ? `Palermo no aprueba: ${JSON.stringify(veredicto.motivos)}` : 'sin veredicto de Palermo en el dossier'
    await setErrorEntrega(site.id, motivos)
    return { error: motivos, sinAprobacion: true }
  }

  const borrador = ultimo(payloads, 'sitioBorrador', leerBorrador)
  if (!borrador) {
    await setErrorEntrega(site.id, 'dossier sin sitioBorrador utilizable')
    return { error: 'dossier sin sitioBorrador utilizable', sinBorrador: true }
  }

  if (site.modo === 'wordnext') {
    const { paginas, descartes } = validarPaginas(borrador.paginasWordNext)
    if (!paginas.length) {
      const error = `ninguna página válida tras la validación (${descartes.slice(0, 5).join('; ')})`
      await setErrorEntrega(site.id, error)
      return { error }
    }
    const pages: PaginaWordNext[] = paginas.map((p) => ({ title: p.titulo, slug: p.slug, kind: p.kind, blocks: p.blocks }))
    const r =
      site.alcance === 'sitio'
        ? await crearSitio({ nombre: borrador.nombre || site.titulo, subdominio: site.subdominio, pages, bandaSiteId: site.id })
        : site.tenantId
          ? await agregarPaginas({ tenantId: site.tenantId, pages, bandaSiteId: site.id })
          : { error: 'falta tenantId para alcance paginas' }
    if (esError(r)) {
      await setErrorEntrega(site.id, r.error)
      return { error: r.error }
    }
    const entrega: EntregaSitio = { tipo: 'wordnext', tenantId: r.tenantId, domain: r.domain, url: r.url, paginas: r.creadas, omitidas: r.omitidas ?? 0, descartados: descartes, entregadoAt: now.toISOString() }
    await setEntrega(site.id, entrega)
    return { entrega }
  }

  // modo estatico: paquete local, sin red.
  const { paginas, descartes } = validarPaginasEstaticas(borrador.paginasEstaticas)
  if (!paginas.length) {
    const error = `ninguna página válida tras la validación (${descartes.slice(0, 5).join('; ')})`
    await setErrorEntrega(site.id, error)
    return { error }
  }
  const menu = paginas.map((p) => ({ path: p.path, titulo: p.titulo }))
  const ficheros: { path: string; contenido: string }[] = paginas.map((p) => ({ path: p.path, contenido: htmlConEsqueleto(p.path, p.titulo, p.html, menu) }))
  if (!paginas.some((p) => p.path === 'index.html')) ficheros.push({ path: 'index.html', contenido: htmlConEsqueleto('index.html', paginas[0].titulo, paginas[0].html, menu) })
  let css = borrador.stylesCss?.trim() || CSS_BASE
  if (Buffer.byteLength(css, 'utf8') > MAX_CSS_BYTES) css = CSS_BASE
  ficheros.push({ path: 'styles.css', contenido: css })
  ficheros.push({
    path: 'README.md',
    contenido: `# ${borrador.nombre || site.titulo}\n\nPaquete estático generado por La Banda el ${now.toISOString()}.\n\n- Abre \`index.html\` en el navegador para verlo en local.\n- Para publicarlo: arrastra la carpeta a Netlify Drop o \`vercel deploy\` (cualquier hosting estático sirve).\n- Los datos marcados \`[RELLENAR]\` deben completarlos humanos antes de publicar.\n`,
  })
  const guardadas = await writeFiles(site.id, ficheros)
  const entrega: EntregaSitio = {
    tipo: 'estatico',
    ficheros: guardadas.map((f) => ({ path: f.path, bytes: f.bytes })),
    descargaUrl: `/api/v1/sitios/${site.id}/paquete`,
    paginas: paginas.length,
    descartados: descartes,
    entregadoAt: now.toISOString(),
  }
  await setEntrega(site.id, entrega)
  return { entrega }
}
