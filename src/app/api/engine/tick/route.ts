import { NextResponse, after } from 'next/server'
import { engine } from '@/engine'
import { TICK_HEADER, engineSecret, procesarEnCadena } from '@/engine/tick'
import { getDomain } from '@domains/index'
import { FIREWALL_DOMAIN } from '@/lib/firewall/config'
import { finalizarRevisionDeSesion, marcarEnCurso } from '@/lib/firewall/cycle'
import { firewallStoreDb, leerSesionDb } from '@/lib/firewall/store'
import { NEGOCIACION_DOMAIN } from '@/lib/negociacion/config'
import { finalizarNegociacionDeSesion } from '@/lib/negociacion/ciclo'
import { redStoreDb } from '@/lib/negociacion/store'
import { MARKETING_DOMAIN } from '@/lib/marketing/config'
import { finalizarSesion as finalizarMarketing } from '@/lib/marketing/ciclo'
import { leerSesion as leerSesionMarketing, marketingStoreDb } from '@/lib/marketing/store'

export const dynamic = 'force-dynamic'
/** Una invocación de agente (GLM/Claude con herramientas) puede tardar más de un minuto. */
export const maxDuration = 300

/** POST { domain, sessionId } · cabecera x-engine-secret. Responde 202 y procesa UN paso en `after()`. */
export async function POST(req: Request) {
  if (req.headers.get(TICK_HEADER) !== engineSecret()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { domain?: string; sessionId?: string } | null
  if (!body?.domain || !body.sessionId) return NextResponse.json({ error: 'domain y sessionId requeridos' }, { status: 400 })

  const domain = getDomain(body.domain)
  const sessionId = body.sessionId

  // Varios pasos SEGUIDOS mientras quede presupuesto (sin HTTP entre pasos: no reabre el 508).
  // Lo que no dé tiempo lo sigue la bomba (/api/cron/tick, cada minuto). Un tick nunca llama a otro.
  after(async () => {
    const firewall = domain.name === FIREWALL_DOMAIN
    try {
      if (firewall) await marcarEnCurso(sessionId, firewallStoreDb)
      await procesarEnCadena(engine, domain, sessionId)
    } catch (err) {
      console.error('[la-banda] tick', domain.name, sessionId, err)
    }
    // Firewall: si la mesa terminó en este tick, el veredicto sale ya (fila + webhook), sin esperar al cron.
    if (firewall) {
      try {
        await finalizarRevisionDeSesion(sessionId, { store: firewallStoreDb, sesion: leerSesionDb })
      } catch (err) {
        console.error('[la-banda] firewall cierre', sessionId, err)
      }
    }
    // Negociación: al terminar la mesa, el desenlace (fijado por el código) pasa a la fila y se avisa.
    if (domain.name === NEGOCIACION_DOMAIN) {
      try {
        await finalizarNegociacionDeSesion(sessionId, { store: redStoreDb, sesion: leerSesionDb })
      } catch (err) {
        console.error('[la-banda] negociacion cierre', sessionId, err)
      }
    }
    // Marketing: si la mesa terminó sin enviar el artículo, el tema pasa a vetado o fallido con su motivo.
    if (domain.name === MARKETING_DOMAIN) {
      try {
        await finalizarMarketing(sessionId, { store: marketingStoreDb, leerSesion: leerSesionMarketing })
      } catch (err) {
        console.error('[la-banda] marketing cierre', sessionId, err)
      }
    }
  })

  return NextResponse.json({ accepted: true, sessionId }, { status: 202 })
}
