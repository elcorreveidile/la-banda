import { NextResponse } from 'next/server'
import { runTradingCycle } from '@/lib/trading/cycle'
import { engineSecret, kickTick, selfOrigin } from '@/engine/tick'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Cron horario de Vercel (vercel.json). Vercel envía `Authorization: Bearer CRON_SECRET`.
 * Descarga velas, gestiona posiciones, abre la sesión y arranca la cadena de ticks.
 */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${engineSecret()}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const result = await runTradingCycle('cron')
    await kickTick(selfOrigin(req.url), 'trading', result.sessionId)
    return NextResponse.json({
      ok: true,
      sessionId: result.sessionId,
      cycle: result.cycle,
      candles: result.candles,
      closedPositions: result.closedPositions.map((c) => ({ symbol: c.order.symbol, reason: c.reason, pnlUsd: c.pnlUsd })),
    })
  } catch (err) {
    console.error('[la-banda] cron trading', err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
