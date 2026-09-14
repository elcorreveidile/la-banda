/**
 * Bomba de ticks: el motor NO se auto-encadena (un tick nunca lanza el siguiente).
 * Cada minuto (/api/cron/tick) esta bomba recorre los dominios y, por cada sesión
 * abierta con un traspaso pendiente y sin otro en curso, lanza UN tick desde cero.
 *
 * Por qué: encadenar tick → tick acumulaba la traza de Vercel (`x-vercel-id`, un salto
 * por función) y su borde respondía 508 a las llamadas a la Clínica a partir del 4.º
 * agente; y un kick perdido dejaba la sesión colgada. Lanzar siempre desde el cron o
 * desde el panel mantiene cada tick a 1-2 saltos. Coste: hasta un minuto entre agentes.
 *
 * Además libera los traspasos `in_progress` cuyo tick murió (releaseStale) y abandona
 * las sesiones demasiado antiguas para su dominio (recoverOpen).
 */

import { engine } from '@/engine'
import { kickTick } from '@/engine/tick'
import { listDomains } from '@domains/index'
import type { DomainConfig } from '@domains/types'

/** Un tick reclamado hace más de esto sin terminar se da por muerto (maxDuration del tick 300 s + margen). */
export const STALE_CLAIM_MS = 7 * 60_000

/** Sesiones abiertas más antiguas que esto se abandonan (los datos ya no valen). */
const STALE_SESSION_POR_DOMINIO: Record<string, number> = {
  trading: 90 * 60_000,
  'corpus-ele': 6 * 60 * 60_000,
}
const STALE_SESSION_DEFECTO = 6 * 60 * 60_000

export function staleSessionMs(domain: string): number {
  return STALE_SESSION_POR_DOMINIO[domain] ?? STALE_SESSION_DEFECTO
}

export interface ResultadoBomba {
  /** Sesiones a las que se lanzó un tick (dominio:id). */
  kicked: string[]
  /** Kicks que fallaron (dominio:id → error). */
  fallidos: Record<string, string>
  /** Traspasos in_progress devueltos a pendiente (tick perdido). */
  released: string[]
  /** Sesiones cerradas como fallidas (intentos agotados o demasiado antiguas). */
  failed: string[]
  abandoned: string[]
  /** Sesiones abiertas con un agente trabajando ahora mismo (no se tocan). */
  enCurso: string[]
}

/** Un ciclo de bomba sobre los dominios dados (todos por defecto). `now` para tests. */
export async function bombear(origin: string, dominios: DomainConfig[] = listDomains(), now = Date.now()): Promise<ResultadoBomba> {
  const r: ResultadoBomba = { kicked: [], fallidos: {}, released: [], failed: [], abandoned: [], enCurso: [] }
  for (const domain of dominios) {
    const stale = await engine.releaseStale(domain, STALE_CLAIM_MS, now)
    r.released.push(...stale.released.map((id) => `${domain.name}:${id}`))
    r.failed.push(...stale.failed.map((id) => `${domain.name}:${id}`))

    const { resume, abandoned } = await engine.recoverOpen(domain, staleSessionMs(domain.name), now)
    r.abandoned.push(...abandoned.map((id) => `${domain.name}:${id}`))

    for (const id of resume) {
      const clave = `${domain.name}:${id}`
      if (await engine.hasInProgress(id)) {
        r.enCurso.push(clave)
        continue
      }
      if (!(await engine.hasPending(id))) continue
      try {
        await kickTick(origin, domain.name, id)
        r.kicked.push(clave)
      } catch (err) {
        r.fallidos[clave] = err instanceof Error ? err.message : String(err)
        console.error('[la-banda] bomba kickTick', clave, err)
      }
    }
  }
  return r
}
