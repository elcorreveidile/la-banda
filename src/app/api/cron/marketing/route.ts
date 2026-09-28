import { NextResponse } from 'next/server'
import { engine } from '@/engine'
import { engineSecret } from '@/engine/tick'
import { getDomain } from '@domains/index'
import { cicloMarketing } from '@/lib/marketing/ciclo'
import { MARKETING_DOMAIN, MARKETING_SESION_MAX_MS, MARKETING_TRAZA_MS } from '@/lib/marketing/config'
import { depsMarketing } from '@/lib/marketing/deps'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Cron de Vercel (vercel.json, cada hora). Calendario semanal en hora de Madrid: jueves propone
 * temas, jueves a sábado redacta los de la semana siguiente, domingo a las 08:00 manda el
 * resumen de revisión. Además abandona mesas colgadas (3 h) y purga la traza de 90 días.
 */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${engineSecret()}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const dominio = getDomain(MARKETING_DOMAIN)
    const { abandoned } = await engine.recoverOpen(dominio, MARKETING_SESION_MAX_MS)
    const r = await cicloMarketing(depsMarketing(req.url))
    const purgadas = (await engine.purgeClosed(dominio, MARKETING_TRAZA_MS)).length
    return NextResponse.json({ ok: true, ...r, abandonadas: abandoned.length, sesionesPurgadas: purgadas })
  } catch (err) {
    console.error('[la-banda] cron marketing', err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
