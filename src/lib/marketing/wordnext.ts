/**
 * Cliente de la API de PUBLICACIÓN de WordNext (wp-next-starter 1.78.0 + 1.80.0) para el
 * dominio marketing, y lectura del aviso de estado que WordNext manda de vuelta.
 *
 * Salida: `POST <WordNext>/api/v1/publicaciones` con la FIRMA DE PLATAFORMA: HMAC-SHA256 de
 * `<ts>.<MÉTODO>.<ruta>.<cuerpo>` con WORDNEXT_CALLBACK_SECRET (= LA_BANDA_CALLBACK_SECRET
 * allí), cabeceras `X-Banda-Timestamp` (segundos) y `X-Banda-Signature: sha256=<hex>`. Crea una
 * entrada BORRADOR y una pieza «por revisar»: nada se publica sin que una persona la apruebe.
 * Origen: WORDNEXT_PUBLISH_URL (URL completa) o, si no, WORDNEXT_URL / el origen de
 * WORDNEXT_CALLBACK_URL + `/api/v1/publicaciones`.
 *
 * Entrada: WordNext avisa de cada cambio de estado a `/api/v1/marketing/publicaciones` con
 * `Authorization: Bearer LA_BANDA_API_KEY` y `X-Banda-Signature: sha256=HMAC(secreto, cuerpo)`.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { fetchLimpio } from '@/lib/httpLimpio'
import type { EstadoPieza } from '@/db/marketing'

const TIMEOUT_MS = 30_000
type Env = Record<string, string | undefined>

export function urlPublicaciones(env: Env = process.env): string | null {
  const explicita = env.WORDNEXT_PUBLISH_URL?.trim()
  if (explicita) return explicita
  const base = env.WORDNEXT_URL?.trim() || env.WORDNEXT_CALLBACK_URL?.trim()
  if (!base) return null
  try {
    return `${new URL(base).origin}/api/v1/publicaciones`
  } catch {
    return null
  }
}

export function publicacionConfigurada(env: Env = process.env): boolean {
  return Boolean(urlPublicaciones(env) && env.WORDNEXT_CALLBACK_SECRET?.trim())
}

export function firmaPlataforma(secreto: string, ts: string, metodo: string, ruta: string, cuerpo: string): string {
  return `sha256=${createHmac('sha256', secreto).update(`${ts}.${metodo.toUpperCase()}.${ruta}.${cuerpo}`).digest('hex')}`
}

export interface EnvioPieza {
  tenant: string
  title: string
  slug: string
  excerpt: string
  seoTitle: string
  seoDescription: string
  html: string
  scheduledAt: string | null
  externalRef: string
  locale: string
  translationKey: string
}

export interface VistaPieza {
  id: string
  status: EstadoPieza
  externalRef: string | null
  url: string | null
  reviewUrl: string | null
  scheduledAt: string | null
  publishedAt: string | null
  feedback: string | null
}

const ESTADOS: EstadoPieza[] = ['pending', 'approved', 'published', 'rejected', 'cancelled']
const txt = (v: unknown, max = 2000): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const httpUrl = (v: unknown): string | null => {
  const s = txt(v, 1000)
  return s && /^https?:\/\//.test(s) ? s : null
}

/** Lee la vista de una pieza (respuesta del POST o aviso de estado). null si no tiene forma. */
export function leerVistaPieza(v: unknown): VistaPieza | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const id = txt(o.id, 100)
  const status = ESTADOS.find((e) => e === o.status)
  if (!id || !status) return null
  return {
    id,
    status,
    externalRef: txt(o.externalRef, 100),
    url: httpUrl(o.url),
    reviewUrl: httpUrl(o.reviewUrl),
    scheduledAt: txt(o.scheduledAt, 40),
    publishedAt: txt(o.publishedAt, 40),
    feedback: txt(o.feedback, 1000),
  }
}

export type ResultadoEnvio = { ok: true; vista: VistaPieza; duplicada: boolean } | { ok: false; error: string; codigo?: number }

export interface DepsEnvio {
  env?: Env
  now?: () => number
  pedir?: typeof fetchLimpio
}

/** Crea (o recupera, por externalRef) la pieza en WordNext. Nunca lanza. */
export async function enviarPieza(p: EnvioPieza, deps: DepsEnvio = {}): Promise<ResultadoEnvio> {
  const env = deps.env ?? process.env
  const url = urlPublicaciones(env)
  const secreto = env.WORDNEXT_CALLBACK_SECRET?.trim()
  if (!url || !secreto) return { ok: false, error: 'publicación en WordNext no configurada (WORDNEXT_URL y WORDNEXT_CALLBACK_SECRET)' }
  const cuerpo = JSON.stringify({
    tenant: p.tenant,
    title: p.title,
    slug: p.slug,
    excerpt: p.excerpt,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    html: p.html,
    scheduledAt: p.scheduledAt,
    externalRef: p.externalRef,
    locale: p.locale,
    translationKey: p.translationKey,
  })
  const ts = String(Math.floor((deps.now ?? Date.now)() / 1000))
  const ruta = new URL(url).pathname
  try {
    // fetchLimpio: WordNext también es Vercel y su borde da 508 si llega la traza de la cadena de ticks.
    const res = await (deps.pedir ?? fetchLimpio)(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-banda-timestamp': ts, 'x-banda-signature': firmaPlataforma(secreto, ts, 'POST', ruta, cuerpo) },
      body: cuerpo,
      timeoutMs: TIMEOUT_MS,
    })
    const data = (await res.json<Record<string, unknown>>().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok) return { ok: false, codigo: res.status, error: `WordNext respondió ${res.status}: ${txt(data?.error, 300) ?? res.statusText}` }
    const vista = leerVistaPieza(data)
    if (!vista) return { ok: false, codigo: res.status, error: 'respuesta de WordNext sin forma de pieza' }
    return { ok: true, vista, duplicada: data?.duplicate === true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Firma del aviso entrante (cuerpo exacto), en tiempo constante. Sin secreto, nunca vale. */
export function avisoFirmado(cuerpo: string, firma: string | null, env: Env = process.env): boolean {
  const secreto = env.WORDNEXT_CALLBACK_SECRET?.trim()
  if (!secreto || !firma) return false
  const esperada = Buffer.from(`sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`)
  const dada = Buffer.from(firma.trim())
  return esperada.length === dada.length && timingSafeEqual(esperada, dada)
}

/** externalRef de una versión de idioma de un tema: `lb-mkt.<temaId>.v<version>.<locale>`. */
export function refPieza(temaId: string, version: number, locale: string): string {
  return `lb-mkt.${temaId}.v${version}.${locale}`
}

/** Clave de traducción compartida por las dos versiones de un tema (y de sus reescrituras). */
export function claveTraduccion(temaId: string): string {
  return `lb-mkt.${temaId}`
}
