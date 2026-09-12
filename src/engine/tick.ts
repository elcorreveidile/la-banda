/**
 * Cadena de ticks: cada invocación de /api/engine/tick procesa UN traspaso y
 * encadena la siguiente. Así ningún agente depende del tiempo máximo de una
 * función y una caída no pierde la sesión (queda el traspaso pendiente).
 */

export const TICK_HEADER = 'x-engine-secret'

export function engineSecret(): string {
  const s = process.env.CRON_SECRET?.trim()
  if (!s) throw new Error('Falta CRON_SECRET')
  return s
}

/** Origen absoluto para llamarse a sí mismo: APP_URL o el de la petición. */
export function selfOrigin(requestUrl?: string): string {
  const env = process.env.APP_URL?.trim()
  if (env) return env.replace(/\/$/, '')
  if (requestUrl) return new URL(requestUrl).origin
  throw new Error('Falta APP_URL')
}

/** Lanza el siguiente tick. El tick responde 202 al instante, así que esto vuelve enseguida. */
export async function kickTick(origin: string, domain: string, sessionId: string): Promise<void> {
  const res = await fetch(`${origin}/api/engine/tick`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [TICK_HEADER]: engineSecret() },
    body: JSON.stringify({ domain, sessionId }),
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`tick ${res.status}`)
}
