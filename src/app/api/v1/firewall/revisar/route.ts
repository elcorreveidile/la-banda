import { after } from 'next/server'
import { engine } from '@/engine'
import { kickTick, selfOrigin } from '@/engine/tick'
import { getDomain } from '@domains/index'
import { manejarPost } from '@/lib/firewall/api'
import { FIREWALL_DOMAIN, modelosDisponibles } from '@/lib/firewall/config'
import { firewallStoreDb } from '@/lib/firewall/store'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/firewall/revisar → wp-next-starter manda una cuarentena del carril rápido
 * (Bearer LA_BANDA_API_KEY). Responde 202 enseguida: `cached` con el veredicto si el patrón
 * ya se juzgó, o `queued` y la mesa arranca en `after()`. Contrato en el CLAUDE.md.
 */
export async function POST(req: Request) {
  const origin = selfOrigin(req.url)
  return manejarPost(req, {
    store: firewallStoreDb,
    modelosOk: () => modelosDisponibles(),
    // El dato del atacante NO va en el payload de la tarea: lo sirve leerCuarentena, delimitado.
    abrirMesa: async (rev) => {
      const { session } = await engine.openSession(getDomain(FIREWALL_DOMAIN), {
        kind: 'agent-quarantine',
        createdBy: 'wordnext',
        payload: { kind: 'agent-quarantine', revisionId: rev.id, reason: rev.reason },
      })
      return session.id
    },
    lanzar: (sessionId) =>
      after(async () => {
        try {
          await kickTick(origin, FIREWALL_DOMAIN, sessionId)
        } catch (err) {
          console.error('[la-banda] kickTick firewall', sessionId, err)
        }
      }),
  })
}
