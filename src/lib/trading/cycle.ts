import { engine } from '@/engine'
import { getDomain } from '@domains/index'
import { fetchHourlyCandles } from './candles'
import { manageOpenPositions, snapshot, storeCandles, type ClosedPosition } from './portfolio'
import { SYMBOLS } from './sim'

export interface CycleResult {
  sessionId: string
  cycle: string
  candles: Record<string, { stored: number; source: string; lastClosed: string | null; lastClose: number | null; error?: string }>
  closedPositions: ClosedPosition[]
}

/**
 * Un ciclo horario (brief §5): descarga y guarda velas, gestiona las posiciones
 * abiertas (stop/objetivo/caducidad) y abre una sesión corta del dominio trading.
 * No corre a los agentes: eso lo hace la cadena de ticks (`kickTick`).
 */
export async function runTradingCycle(createdBy: string): Promise<CycleResult> {
  const cycle = new Date().toISOString()
  const candles: CycleResult['candles'] = {}
  for (const symbol of SYMBOLS) {
    try {
      const { candles: rows, source } = await fetchHourlyCandles(symbol, 120)
      const stored = await storeCandles(symbol, rows, source)
      const last = rows.at(-1)
      candles[symbol] = { stored, source, lastClosed: last ? new Date(last.ts).toISOString() : null, lastClose: last?.close ?? null }
    } catch (err) {
      candles[symbol] = { stored: 0, source: 'none', lastClosed: null, lastClose: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  const closedPositions = await manageOpenPositions()
  const cartera = await snapshot()

  const domain = getDomain('trading')
  const { session } = await engine.openSession(domain, {
    kind: 'ciclo',
    createdBy,
    payload: {
      ciclo: cycle,
      simbolos: [...SYMBOLS],
      velas: candles,
      cartera: { cajaUsd: cartera.cashUsd, patrimonioUsd: cartera.equityUsd, posicionesAbiertas: cartera.positions.map((p) => ({ symbol: p.symbol, entryPrice: p.entryPrice, stopPrice: p.stopPrice, targetPrice: p.targetPrice, hoursOpen: p.hoursOpen })) },
      cierresEsteCiclo: closedPositions.map((c) => ({ symbol: c.order.symbol, reason: c.reason, pnlUsd: Number(c.pnlUsd.toFixed(4)) })),
    },
  })
  return { sessionId: session.id, cycle, candles, closedPositions }
}
