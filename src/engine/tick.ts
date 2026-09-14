/**
 * Cadena de ticks: cada invocación de /api/engine/tick procesa UN traspaso y
 * encadena la siguiente. Así ningún agente depende del tiempo máximo de una
 * función y una caída no pierde la sesión (queda el traspaso pendiente).
 */

import { fetchLimpio } from '@/lib/httpLimpio'
import type { Engine } from '@/engine/orchestrator'
import type { DomainConfig } from '@domains/types'

export const TICK_HEADER = 'x-engine-secret'

/**
 * Presupuesto de un tick (< maxDuration 300 s de la ruta) y mínimo para encadenar otro paso.
 * El tick procesa varios pasos SEGUIDOS dentro de la misma función mientras quede presupuesto:
 * como no hay llamada HTTP entre pasos, no se acumula la traza x-vercel-id (508 de Vercel).
 * Cada paso encadenado recibe el tiempo restante como deadline, así ninguno pasa del maxDuration.
 */
export const TICK_BUDGET_MS = 285_000
export const MIN_CHAIN_MS = 90_000

/**
 * Procesa pasos de una sesión en cadena dentro de un mismo tick. Para cuando la sesión
 * termina, otro tick ya reclamó el traspaso (`skipped`) o queda menos presupuesto que
 * `MIN_CHAIN_MS` (lo sigue la bomba dentro de un minuto). Devuelve cuántos pasos hizo.
 */
export async function procesarEnCadena(
  engine: Pick<Engine, 'step'>,
  domain: DomainConfig,
  sessionId: string,
  opts: { budgetMs?: number; minChainMs?: number; now?: () => number } = {},
): Promise<number> {
  const budget = opts.budgetMs ?? TICK_BUDGET_MS
  const minChain = opts.minChainMs ?? MIN_CHAIN_MS
  const now = opts.now ?? Date.now
  const inicio = now()
  let pasos = 0
  let r = await engine.step(domain, sessionId, { deadlineMs: budget })
  pasos++
  while (!r.done && !r.skipped) {
    const restante = budget - (now() - inicio)
    if (restante < minChain) break
    r = await engine.step(domain, sessionId, { deadlineMs: restante })
    pasos++
  }
  return pasos
}

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
      // fetchLimpio y no fetch: cada tick nace sin la traza x-vercel-id acumulada (508 de Vercel).
      const res = await fetchLimpio(`${origin}/api/engine/tick`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [TICK_HEADER]: engineSecret(), ...bypassHeaders() },
        body: JSON.stringify({ domain, sessionId }),
        timeoutMs: 10_000,
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
