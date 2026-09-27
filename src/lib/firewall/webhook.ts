/**
 * Aviso del veredicto a wp-next-starter por webhook.
 *
 * POST a `WORDNEXT_CALLBACK_URL` con el MISMO JSON que devuelve el GET
 * (`salidaDe`), firmado: `X-Banda-Signature: sha256=<hex HMAC-SHA256(WORDNEXT_CALLBACK_SECRET, cuerpo)>`
 * sobre los bytes exactos del cuerpo. Sin URL o sin secreto NO se envía (nunca sin firma):
 * el aviso queda `no_aplica` y wp-next-starter puede consultar el GET.
 *
 * El intento 1 sale al cerrar la mesa (hook del tick); los reintentos los hace el cron
 * /api/cron/firewall con el mismo backoff que peticiones (1, 5, 15, 60 min; 12 intentos o 24 h).
 * URL externa: fetch normal (el 508 de Vercel es contra funciones propias).
 */

import { createHmac } from 'node:crypto'
import type { Revision } from '@/db/firewall'
import { agotadoAviso, venceAviso } from '@/lib/peticiones/webhook'
import { salidaDe } from './veredicto'
import type { FirewallStore } from './store'

const TIMEOUT_MS = 8_000
export const CABECERA_FIRMA = 'x-banda-signature'

export { agotadoAviso, venceAviso }

export interface DepsAviso {
  fetchFn?: typeof fetch
  now?: () => number
  env?: Record<string, string | undefined>
}

export function avisoConfigurado(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.WORDNEXT_CALLBACK_URL?.trim() && env.WORDNEXT_CALLBACK_SECRET?.trim())
}

export function firmar(cuerpo: string, secreto: string): string {
  return `sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`
}

export async function enviarVeredicto(rev: Revision, deps: DepsAviso = {}): Promise<{ ok: boolean; codigo?: number; error?: string }> {
  const env = deps.env ?? process.env
  const url = env.WORDNEXT_CALLBACK_URL?.trim()
  const secreto = env.WORDNEXT_CALLBACK_SECRET?.trim()
  if (!url || !secreto) return { ok: false, error: 'webhook no configurado' }
  const cuerpo = JSON.stringify(salidaDe(rev))
  try {
    const res = await (deps.fetchFn ?? fetch)(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CABECERA_FIRMA]: firmar(cuerpo, secreto), 'x-banda-revision': rev.id },
      body: cuerpo,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.ok) return { ok: true, codigo: res.status }
    return { ok: false, codigo: res.status, error: `receptor respondió ${res.status}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** UN intento: envía y actualiza los campos de aviso de la fila. */
export async function intentarAvisoRevision(store: FirewallStore, rev: Revision, deps: DepsAviso = {}): Promise<{ ok: boolean; error?: string }> {
  const now = new Date((deps.now ?? Date.now)())
  const intentos = rev.avisoIntentos + 1
  const r = await enviarVeredicto(rev, deps)
  await store.actualizar(rev.id, { avisoEstado: r.ok ? 'enviado' : 'pendiente', avisoIntentos: intentos, avisoUltimoAt: now, avisoUltimoError: r.error ?? null })
  return r
}
