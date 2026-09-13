import { NextResponse } from 'next/server'
import { engineSecret, kickTick, selfOrigin } from '@/engine/tick'
import { CORPUS_DOMAIN, runCorpusCycle } from '@/lib/corpus/cycle'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Cron diario de Vercel (vercel.json). Recoge de la Clínica las producciones pendientes
 * con consentimiento, abre una sesión por cada una, relanza las abiertas, abandona las
 * colgadas y purga la traza antigua del dominio.
 */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${engineSecret()}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const result = await runCorpusCycle('cron')
    const origin = selfOrigin(req.url)
    const kicks: Record<string, string> = {}
    for (const id of [...result.opened, ...result.resume]) {
      try {
        await kickTick(origin, CORPUS_DOMAIN, id)
        kicks[id] = 'ok'
      } catch (err) {
        kicks[id] = err instanceof Error ? err.message : String(err)
        console.error('[la-banda] cron corpus kickTick', id, origin, err)
      }
    }
    return NextResponse.json({ ok: true, origin, opened: result.opened, resumed: result.resume, abandoned: result.abandoned, purged: result.purged, ticks: kicks, error: result.error ?? null })
  } catch (err) {
    console.error('[la-banda] cron corpus', err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
