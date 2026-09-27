import { NextResponse } from 'next/server'
import { engineSecret } from '@/engine/tick'
import { cicloPeticiones } from '@/lib/peticiones/ciclo'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Cron de Vercel (vercel.json, cada 5 min). Cierra el estado de las peticiones cuya
 * sesión terminó, aplica la guarda de huecos (informe desde finalReport) y reintenta
 * los webhooks pendientes con backoff.
 */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${engineSecret()}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const r = await cicloPeticiones()
    return NextResponse.json({ ok: true, ...r })
  } catch (err) {
    console.error('[la-banda] cron peticiones', err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
