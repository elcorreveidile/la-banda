/**
 * Dependencias REALES del ciclo de política (motor, BD, sondeo). Aparte de ciclo.ts para que este
 * siga siendo testeable sin Next ni BD.
 */

import { engine } from '@/engine'
import { kickTick, selfOrigin } from '@/engine/tick'
import { getDomain } from '@domains/index'
import type { DepsPolitica } from './ciclo'
import { POLITICA_DOMAIN } from './config'
import { leerSesion, politicaStoreDb } from './store'

export function depsPolitica(requestUrl?: string): DepsPolitica {
  return {
    store: politicaStoreDb,
    leerSesion,
    abrirSesion: async (kind, payload) => {
      const { session } = await engine.openSession(getDomain(POLITICA_DOMAIN), { kind, payload, createdBy: 'politica' })
      // Si el primer tick no sale, la bomba (/api/cron/tick) lo lanza en el minuto siguiente.
      try {
        await kickTick(selfOrigin(requestUrl), POLITICA_DOMAIN, session.id)
      } catch (err) {
        console.error('[la-banda] kickTick politica', session.id, err)
      }
      return session.id
    },
  }
}
