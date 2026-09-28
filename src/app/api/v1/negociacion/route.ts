import { after } from 'next/server'
import { engine } from '@/engine'
import { kickTick, selfOrigin } from '@/engine/tick'
import { getDomain } from '@domains/index'
import { manejarAbrir } from '@/lib/negociacion/api'
import { NEGOCIACION_DOMAIN, modelosDisponibles } from '@/lib/negociacion/config'
import { redStoreDb } from '@/lib/negociacion/store'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/negociacion → el nodo COMPRADOR pide presupuesto a un nodo vendedor.
 * 202 enseguida; la mesa arranca en `after()`. La solicitud NO va en el payload de la tarea:
 * las herramientas la leen de la fila, delimitada como dato que no es de fiar.
 */
export async function POST(req: Request) {
  const origin = selfOrigin(req.url)
  return manejarAbrir(req, {
    store: redStoreDb,
    modelosOk: () => modelosDisponibles(),
    abrirMesa: async (n) => {
      const { session } = await engine.openSession(getDomain(NEGOCIACION_DOMAIN), {
        kind: 'quote-request',
        createdBy: `nodo:${n.compradorNodoId}`,
        payload: { kind: 'quote-request', negociacionId: n.id },
      })
      return session.id
    },
    lanzar: (sessionId) =>
      after(async () => {
        try {
          await kickTick(origin, NEGOCIACION_DOMAIN, sessionId)
        } catch (err) {
          console.error('[la-banda] kickTick negociacion', sessionId, err)
        }
      }),
  })
}
