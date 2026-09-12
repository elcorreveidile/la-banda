import { and, count, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { events, sessions } from '@/db/schema'
import { ordersSim } from '@/db/trading'
import { snapshot, type PortfolioSnapshot } from './portfolio'

export interface TradeRow {
  id: string
  symbol: string
  status: string
  sizeUsd: number
  entryPrice: number
  exitPrice: number | null
  exitReason: string | null
  pnlUsd: number | null
  openedAt: string
  closedAt: string | null
  note: string | null
}

export interface TradingMetrics {
  portfolio: PortfolioSnapshot
  sessions: number
  executed: number
  vetoes: number
  returns: number
  trades: TradeRow[]
  realizedUsd: number
}

/** Métricas del panel (brief §5): saldo, operaciones, vetos de Palermo, devoluciones de Lisboa, resultado por operación. */
export async function tradingMetrics(): Promise<TradingMetrics> {
  const portfolio = await snapshot()
  const [s] = await db.select({ n: count() }).from(sessions).where(eq(sessions.domain, 'trading'))
  const [v] = await db.select({ n: count() }).from(events).where(and(eq(events.type, 'veto'), eq(events.agentId, 'trading:Palermo')))
  const [r] = await db.select({ n: count() }).from(events).where(and(eq(events.type, 'return'), eq(events.agentId, 'trading:Lisboa')))
  const rows = await db.select().from(ordersSim).orderBy(desc(ordersSim.openedAt)).limit(50)
  const trades: TradeRow[] = rows.map((o) => ({
    id: o.id,
    symbol: o.symbol,
    status: o.status,
    sizeUsd: Number(o.sizeUsd),
    entryPrice: Number(o.entryPrice),
    exitPrice: o.exitPrice == null ? null : Number(o.exitPrice),
    exitReason: o.exitReason,
    pnlUsd: o.pnlUsd == null ? null : Number(o.pnlUsd),
    openedAt: o.openedAt.toISOString(),
    closedAt: o.closedAt?.toISOString() ?? null,
    note: o.conditions,
  }))
  return {
    portfolio,
    sessions: Number(s?.n ?? 0),
    executed: trades.filter((t) => t.status !== 'rejected').length,
    vetoes: Number(v?.n ?? 0),
    returns: Number(r?.n ?? 0),
    trades,
    realizedUsd: trades.reduce((a, t) => a + (t.pnlUsd ?? 0), 0),
  }
}
