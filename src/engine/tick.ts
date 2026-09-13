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

/**
 * Origen absoluto para llamarse a sí mismo. Orden: APP_URL → dominio de producción
 * que Vercel expone en VERCEL_PROJECT_PRODUCTION_URL → origen de la petición.
 * El origen de la petición NO vale en el cron: Vercel lo invoca por la URL generada
 * del despliegue, que la Deployment Protection estándar deja tras el SSO, y el tick
 * recibía una redirección en vez de ejecutarse (sesiones del cron que nunca avanzaban).
 */
export function selfOrigin(requestUrl?: string): string {
  const env = process.env.APP_URL?.trim()
  if (env) return env.replace(/\/$/, '')
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (prod && process.env.VERCEL_ENV === 'production') return `https://${prod.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
  if (requestUrl) return new URL(requestUrl).origin
  throw new Error('Falta APP_URL')
}

/**
 * Si el proyecto tiene Deployment Protection también en producción, Vercel
 * define VERCEL_AUTOMATION_BYPASS_SECRET (Protection Bypass for Automation) y
 * las llamadas a uno mismo deben llevar esta cabecera para no acabar en el SSO.
 */
function bypassHeaders(): Record<string, string> {
  const s = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim()
  return s ? { 'x-vercel-protection-bypass': s } : {}
}

const KICK_RETRY_MS = 2_000

/**
 * Lanza el siguiente tick. El tick responde 202 al instante, así que esto vuelve enseguida.
 * Si la petición falla (red, tiempo, no-2xx) reintenta UNA vez tras 2 s: un kick perdido
 * deja la sesión colgada hasta el cron de recuperación.
 */
export async function kickTick(origin: string, domain: string, sessionId: string): Promise<void> {
  let ultimo: unknown
  for (let intento = 0; intento < 2; intento++) {
    if (intento > 0) await new Promise((r) => setTimeout(r, KICK_RETRY_MS))
    try {
      const res = await fetch(`${origin}/api/engine/tick`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [TICK_HEADER]: engineSecret(), ...bypassHeaders() },
        body: JSON.stringify({ domain, sessionId }),
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
      })
      if (res.ok) return
      ultimo = new Error(`tick ${res.status}`)
    } catch (err) {
      ultimo = err
    }
    console.error('[la-banda] kickTick fallo', intento + 1, sessionId, ultimo)
  }
  throw ultimo instanceof Error ? ultimo : new Error(String(ultimo))
}
