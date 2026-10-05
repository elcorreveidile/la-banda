import { NextResponse } from 'next/server'
import { engine } from '@/engine'
import { engineSecret } from '@/engine/tick'
import { getDomain } from '@domains/index'
import { cicloPolitica } from '@/lib/politica/ciclo'
import { POLITICA_DOMAIN, POLITICA_SESION_MAX_MS, POLITICA_TRAZA_MS } from '@/lib/politica/config'
import { depsPolitica } from '@/lib/politica/deps'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Cron de Vercel (vercel.json, minuto 35 de cada hora). Abre la edición que toca (06:30, 12:30 y
 * 18:30 de Madrid para publicar a las 09:00, 15:00 y 21:00) y recoge los envíos de visitantes
 * pendientes de verificar. Además abandona mesas colgadas (3 h) y purga la traza de 90 días.
 */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${engineSecret()}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const dominio = getDomain(POLITICA_DOMAIN)
    const { abandoned } = await engine.recoverOpen(dominio, POLITICA_SESION_MAX_MS)
    const r = await cicloPolitica(depsPolitica(req.url))
    const purgadas = (await engine.purgeClosed(dominio, POLITICA_TRAZA_MS)).length
    return NextResponse.json({ ok: true, ...r, abandonadas: abandoned.length, sesionesPurgadas: purgadas })
  } catch (err) {
    console.error('[la-banda] cron politica', err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
