import { NextResponse, after } from 'next/server'
import { engine } from '@/engine'
import { TICK_HEADER, engineSecret, procesarEnCadena } from '@/engine/tick'
import { getDomain } from '@domains/index'
import { FIREWALL_DOMAIN } from '@/lib/firewall/config'
import { finalizarRevisionDeSesion, marcarEnCurso } from '@/lib/firewall/cycle'
import { firewallStoreDb, leerSesionDb } from '@/lib/firewall/store'

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
  })

  return NextResponse.json({ accepted: true, sessionId }, { status: 202 })
}
