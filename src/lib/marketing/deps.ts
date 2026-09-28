/**
 * Dependencias REALES del ciclo de marketing (motor, BD, Brevo). Aparte de ciclo.ts para que
 * este siga siendo testeable sin Next ni BD.
 */

import { engine } from '@/engine'
import { kickTick, selfOrigin } from '@/engine/tick'
import { getDomain } from '@domains/index'
import { sendBrevoEmail } from '@/lib/brevo'
import type { DepsCiclo } from './ciclo'
import { MARKETING_DOMAIN, revisorEmail } from './config'
import { leerSesion, marketingStoreDb } from './store'

export function depsMarketing(requestUrl?: string): DepsCiclo {
  return {
    store: marketingStoreDb,
    leerSesion,
    abrirSesion: async (kind, payload) => {
      const { session } = await engine.openSession(getDomain(MARKETING_DOMAIN), { kind, payload, createdBy: 'marketing' })
      // Si el primer tick no sale, la bomba (/api/cron/tick) lo lanza en el minuto siguiente.
      try {
        await kickTick(selfOrigin(requestUrl), MARKETING_DOMAIN, session.id)
      } catch (err) {
        console.error('[la-banda] kickTick marketing', session.id, err)
      }
      return session.id
    },
    enviarCorreo: async ({ asunto, html, texto }) => sendBrevoEmail({ to: revisorEmail(), subject: asunto, html, text: texto }),
  }
}
