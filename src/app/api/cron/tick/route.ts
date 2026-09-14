import { NextResponse } from 'next/server'
import { engineSecret, selfOrigin } from '@/engine/tick'
import { bombear } from '@/lib/bomba'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Bomba de ticks (vercel.json, cada minuto). Lanza un tick por cada sesión abierta con
 * un traspaso pendiente y sin agente en curso, libera ticks perdidos y abandona sesiones
 * caducadas. Es el ÚNICO camino por el que avanza una cadena: el tick no se encadena.
 */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${engineSecret()}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const origin = selfOrigin(req.url)
    const r = await bombear(origin)
    return NextResponse.json({ ok: true, origin, ...r })
  } catch (err) {
    console.error('[la-banda] cron tick', err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
