import { NextResponse, after } from 'next/server'
import { engine } from '@/engine'
import { TICK_HEADER, engineSecret } from '@/engine/tick'
import { getDomain } from '@domains/index'

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

  // Un paso y nada más: el siguiente lo lanza la bomba (/api/cron/tick), nunca este tick.
  // Encadenar tick → tick acumulaba la traza de Vercel y la Clínica respondía 508 al 4.º agente.
  after(async () => {
    try {
      await engine.step(domain, sessionId)
    } catch (err) {
      console.error('[la-banda] tick', domain.name, sessionId, err)
    }
  })

  return NextResponse.json({ accepted: true, sessionId }, { status: 202 })
}
