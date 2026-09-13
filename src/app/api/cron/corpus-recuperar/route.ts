import { NextResponse } from 'next/server'
import { engine } from '@/engine'
import { getDomain } from '@domains/index'
import { engineSecret, kickTick, selfOrigin } from '@/engine/tick'
import { CORPUS_DOMAIN, STALE_SESSION_MS } from '@/lib/corpus/cycle'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Cron horario de recuperación del corpus (vercel.json, `35 * * * *`): relanza los
 * ticks de las sesiones abiertas recientes y abandona las colgadas (> 6 h). No habla
 * con la Clínica ni purga: eso lo hace el ciclo diario (/api/cron/corpus). Existe
 * porque un kick perdido dejaba una sesión parada hasta 24 h.
 */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${engineSecret()}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const { resume, abandoned } = await engine.recoverOpen(getDomain(CORPUS_DOMAIN), STALE_SESSION_MS)
    const origin = selfOrigin(req.url)
    const kicks: Record<string, string> = {}
    for (const id of resume) {
      try {
        await kickTick(origin, CORPUS_DOMAIN, id)
        kicks[id] = 'ok'
      } catch (err) {
        kicks[id] = err instanceof Error ? err.message : String(err)
        console.error('[la-banda] cron corpus-recuperar kickTick', id, origin, err)
      }
    }
    return NextResponse.json({ ok: true, origin, resumed: resume, abandoned, ticks: kicks })
  } catch (err) {
    console.error('[la-banda] cron corpus-recuperar', err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
