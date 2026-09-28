import { NextResponse } from 'next/server'
import { engine } from '@/engine'
import { engineSecret } from '@/engine/tick'
import { getDomain } from '@domains/index'
import { cicloRed } from '@/lib/negociacion/ciclo'
import { MESA_MAX_MS, NEGOCIACION_DOMAIN } from '@/lib/negociacion/config'
import { redStoreDb } from '@/lib/negociacion/store'
import { leerSesionDb } from '@/lib/firewall/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Cron de Vercel (cada 5 min): cierra las mesas que terminaron sin que el tick lo recogiera,
 * abandona las colgadas (90 min), caduca propuestas sin aprobar (7 días) y reintenta avisos.
 */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${engineSecret()}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const domain = getDomain(NEGOCIACION_DOMAIN)
    const r = await cicloRed({
      store: redStoreDb,
      sesion: leerSesionDb,
      abandonar: async (sessionId) => {
        await engine.abandonSession(domain, sessionId, `mesa de negociación sin terminar en ${Math.round(MESA_MAX_MS / 60_000)} min`)
      },
    })
    return NextResponse.json({ ok: true, ...r })
  } catch (err) {
    console.error('[la-banda] cron negociacion', err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
