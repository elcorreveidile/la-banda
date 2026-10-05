/**
 * Cliente de la API del sondeo (sondeo-29n, `docs/LA-BANDA.md`): mismo contrato firmado que usa
 * WordNext. `POLITICA_URL` es el origen del sondeo (p. ej. https://29n.olvidos.es) y
 * `POLITICA_SECRET` el MISMO valor que `BANDA_SECRET` allí. Nunca lanza.
 *
 * Salida: `X-Banda-Timestamp` + `X-Banda-Signature: sha256=HMAC(secreto, "<ts>.<MÉTODO>.<ruta>.<cuerpo>")`.
 * Entrada (aviso de estado): `Authorization: Bearer LA_BANDA_API_KEY` y
 * `X-Banda-Signature: sha256=HMAC(secreto, cuerpo)`.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { fetchLimpio } from '@/lib/httpLimpio'
import { firmaPlataforma, leerVistaPieza, type VistaPieza } from '@/lib/marketing/wordnext'
import type { Fuente, Veredicto } from './pieza'

type Env = Record<string, string | undefined>
const TIMEOUT_MS = 30_000

export function urlSondeo(env: Env = process.env): string | null {
  const v = env.POLITICA_URL?.trim()
  if (!v) return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' || u.hostname === 'localhost' ? (u.origin + u.pathname).replace(/\/+$/, '') : null
  } catch {
    return null
  }
}

export const sondeoConfigurado = (env: Env = process.env): boolean => Boolean(urlSondeo(env) && env.POLITICA_SECRET?.trim())

export interface EnvioPolitica {
  title: string
  slug: string
  excerpt: string
  markdown: string
  externalRef: string
  scheduledAt: string | null
  edition: string | null
  kind: 'noticia'
  verification: { verdict: Veredicto; summary: string; sources: Fuente[]; checkedAt: string }
}

export type ResultadoLlamada<T> = { ok: true; data: T } | { ok: false; error: string; codigo?: number }

export interface DepsCliente {
  env?: Env
  now?: () => number
  pedir?: typeof fetchLimpio
}

async function llamar<T>(metodo: 'GET' | 'POST', ruta: string, cuerpo: unknown, deps: DepsCliente): Promise<ResultadoLlamada<T>> {
  const env = deps.env ?? process.env
  const base = urlSondeo(env)
  const secreto = env.POLITICA_SECRET?.trim()
  if (!base || !secreto) return { ok: false, error: 'sondeo no configurado (POLITICA_URL y POLITICA_SECRET)' }
  const raw = cuerpo === undefined ? '' : JSON.stringify(cuerpo)
  const ts = String(Math.floor((deps.now ?? Date.now)() / 1000))
  // La URL del sondeo puede llevar prefijo (https://olvidos.es/contexto): se conserva, y la firma cubre la ruta completa.
  const destino = new URL(base.replace(/\/+$/, '') + ruta)
  const pathname = destino.pathname
  try {
    // fetchLimpio: el sondeo también está en Vercel y su borde da 508 si llega la traza de la cadena de ticks.
    const res = await (deps.pedir ?? fetchLimpio)(destino.toString(), {
      method: metodo,
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-banda-timestamp': ts, 'x-banda-signature': firmaPlataforma(secreto, ts, metodo, pathname, raw) },
      body: raw || undefined,
      timeoutMs: TIMEOUT_MS,
    })
    const data = (await res.json<unknown>().catch(() => null)) as T | null
    if (!res.ok) return { ok: false, codigo: res.status, error: `el sondeo respondió ${res.status}: ${String((data as { error?: unknown } | null)?.error ?? res.statusText).slice(0, 300)}` }
    return { ok: true, data: data as T }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export interface RespuestaPieza extends VistaPieza {
  duplicate?: boolean
  warnings?: string[]
}

const vista = (r: ResultadoLlamada<unknown>): ResultadoLlamada<RespuestaPieza> => {
  if (!r.ok) return r
  const v = leerVistaPieza(r.data)
  if (!v) return { ok: false, error: 'respuesta del sondeo sin forma de pieza' }
  const d = r.data as { duplicate?: unknown; warnings?: unknown }
  return { ok: true, data: { ...v, duplicate: d.duplicate === true, warnings: Array.isArray(d.warnings) ? d.warnings.map(String) : [] } }
}

/** Crea (o recupera, por externalRef) una pieza pendiente de revisión en el sondeo. */
export async function enviarAlSondeo(p: EnvioPolitica, deps: DepsCliente = {}) {
  return vista(await llamar('POST', '/api/v1/publicaciones', p, deps))
}

/** Alta o corrección del veredicto de una pieza que ya existe (p. ej. el envío de un visitante). */
export async function enviarVerificacion(ref: string, v: { verdict: Veredicto; summary: string; sources: Fuente[]; checkedAt: string }, deps: DepsCliente = {}) {
  return vista(await llamar('POST', `/api/v1/publicaciones/${encodeURIComponent(ref)}/verificacion`, v, deps))
}

export interface EnvioVisitante {
  ref: string
  titulo: string
  texto: string
  enlaces: string[]
  recibidoEn: string
}

/** Envíos de visitantes registrados pendientes de verificar. */
export async function traerEnvios(deps: DepsCliente = {}): Promise<ResultadoLlamada<EnvioVisitante[]>> {
  const r = await llamar<{ envios?: unknown }>('GET', '/api/v1/envios', undefined, deps)
  if (!r.ok) return r
  const lista = Array.isArray(r.data?.envios) ? r.data.envios : []
  const envios: EnvioVisitante[] = []
  for (const e of lista.slice(0, 50)) {
    const o = e as Record<string, unknown>
    const ref = typeof o?.ref === 'string' ? o.ref.trim() : ''
    const titulo = typeof o?.titulo === 'string' ? o.titulo.trim().slice(0, 200) : ''
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(ref) || !titulo) continue
    envios.push({
      ref,
      titulo,
      texto: typeof o.texto === 'string' ? o.texto.trim().slice(0, 4000) : '',
      enlaces: (Array.isArray(o.enlaces) ? o.enlaces : []).filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 5),
      recibidoEn: typeof o.recibidoEn === 'string' ? o.recibidoEn : '',
    })
  }
  return { ok: true, data: envios }
}

/** ¿El aviso de estado viene firmado con el secreto compartido? (HMAC del cuerpo exacto, tiempo constante). */
export function avisoFirmado(cuerpo: string, firma: string | null, env: Env = process.env): boolean {
  const secreto = env.POLITICA_SECRET?.trim()
  if (!secreto || !firma) return false
  const esperada = Buffer.from(`sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`)
  const dada = Buffer.from(firma)
  return dada.length === esperada.length && timingSafeEqual(dada, esperada)
}
