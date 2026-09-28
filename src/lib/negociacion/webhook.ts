/**
 * Aviso de cambios de estado a WordNext, con el MISMO mecanismo que el veredicto del
 * firewall (Fase 2b): POST firmado `X-Banda-Signature: sha256=<HMAC(WORDNEXT_CALLBACK_SECRET,
 * cuerpo exacto)>` con el mismo JSON que devuelve el GET (`salidaNegociacion`) más `evento`.
 * URL: `NEGOCIACION_CALLBACK_URL` o, si no está, el origen de `WORDNEXT_CALLBACK_URL` +
 * `/api/la-banda/negociacion`. Sin URL o sin secreto no se envía nunca sin firma (queda el
 * GET). Idempotente para el receptor: el cuerpo es el estado ACTUAL y lleva el id.
 * Reintentos del cron con el backoff de peticiones (1, 5, 15, 60 min; 12 intentos o 24 h).
 */

import type { Negociacion } from '@/db/negociacion'
import { CABECERA_FIRMA, firmar } from '@/lib/firewall/webhook'
import { agotadoAviso, venceAviso } from '@/lib/peticiones/webhook'
import { salidaNegociacion } from './vistas'
import type { RedStore } from './store'

const TIMEOUT_MS = 8_000

export { agotadoAviso, venceAviso, CABECERA_FIRMA }

export interface DepsAvisoNeg {
  fetchFn?: typeof fetch
  now?: () => number
  env?: Record<string, string | undefined>
}

export function urlAviso(env: Record<string, string | undefined> = process.env): string | null {
  const directa = env.NEGOCIACION_CALLBACK_URL?.trim()
  if (directa) return directa
  const base = env.WORDNEXT_CALLBACK_URL?.trim()
  if (!base) return null
  try {
    return `${new URL(base).origin}/api/la-banda/negociacion`
  } catch {
    return null
  }
}

export function avisoNegConfigurado(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(urlAviso(env) && env.WORDNEXT_CALLBACK_SECRET?.trim())
}

export function cuerpoAviso(n: Negociacion): string {
  return JSON.stringify({ evento: n.estado, ...salidaNegociacion(n) })
}

export async function enviarAviso(n: Negociacion, deps: DepsAvisoNeg = {}): Promise<{ ok: boolean; codigo?: number; error?: string }> {
  const env = deps.env ?? process.env
  const url = urlAviso(env)
  const secreto = env.WORDNEXT_CALLBACK_SECRET?.trim()
  if (!url || !secreto) return { ok: false, error: 'webhook no configurado' }
  const cuerpo = cuerpoAviso(n)
  try {
    const res = await (deps.fetchFn ?? fetch)(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CABECERA_FIRMA]: firmar(cuerpo, secreto), 'x-banda-negociacion': n.id },
      body: cuerpo,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return res.ok ? { ok: true, codigo: res.status } : { ok: false, codigo: res.status, error: `receptor respondió ${res.status}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** UN intento: envía y guarda el resultado en la fila. */
export async function intentarAvisoNeg(store: RedStore, n: Negociacion, deps: DepsAvisoNeg = {}): Promise<{ ok: boolean; error?: string }> {
  const now = new Date((deps.now ?? Date.now)())
  const r = await enviarAviso(n, deps)
  await store.actualizarNegociacion(n.id, { avisoEstado: r.ok ? 'enviado' : 'pendiente', avisoIntentos: n.avisoIntentos + 1, avisoUltimoAt: now, avisoUltimoError: r.error ?? null })
  return r
}
