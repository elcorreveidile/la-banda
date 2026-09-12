import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { ordersSim, portfolio, prices, type OrderSim } from '@/db/trading'
import { checkExit, fillBuy, fillSell, INITIAL_USD, validateOrder, type Candle } from './sim'

const MAIN = 'main'
const n = (v: string | number | null | undefined) => Number(v ?? 0)
const s = (v: number) => v.toFixed(8)

/** Cartera única; se crea con 100 USD la primera vez. */
export async function ensurePortfolio() {
  const [row] = await db.select().from(portfolio).where(eq(portfolio.id, MAIN)).limit(1)
  if (row) return row
  const [created] = await db
    .insert(portfolio)
    .values({ id: MAIN, initialUsd: s(INITIAL_USD), cashUsd: s(INITIAL_USD) })
    .onConflictDoNothing()
    .returning()
  return created ?? (await db.select().from(portfolio).where(eq(portfolio.id, MAIN)).limit(1))[0]
}

async function setCash(cashUsd: number) {
  await db.update(portfolio).set({ cashUsd: s(cashUsd), updatedAt: new Date() }).where(eq(portfolio.id, MAIN))
}

/** Guarda velas (una sola sentencia multi-fila; sin transacción). */
export async function storeCandles(symbol: string, candles: Candle[], source: string) {
  if (!candles.length) return 0
  const rows = candles.map((c) => ({ symbol, ts: new Date(c.ts), open: s(c.open), high: s(c.high), low: s(c.low), close: s(c.close), volume: s(c.volume), source }))
  await db
    .insert(prices)
    .values(rows)
    .onConflictDoUpdate({
      target: [prices.symbol, prices.ts],
      set: { open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`, close: sql`excluded.close`, volume: sql`excluded.volume`, source: sql`excluded.source` },
    })
  return rows.length
}

/** Últimas `limit` velas guardadas, en orden cronológico. */
export async function loadCandles(symbol: string, limit = 48): Promise<Candle[]> {
  const rows = await db.select().from(prices).where(eq(prices.symbol, symbol)).orderBy(desc(prices.ts)).limit(Math.min(Math.max(limit, 1), 300))
  return rows.reverse().map((r) => ({ ts: r.ts.getTime(), open: n(r.open), high: n(r.high), low: n(r.low), close: n(r.close), volume: n(r.volume) }))
}

export async function latestCandle(symbol: string): Promise<Candle | null> {
  const [c] = await loadCandles(symbol, 1)
  return c ?? null
}

export interface PositionView {
  id: string
  symbol: string
  qty: number
  entryPrice: number
  stopPrice: number
  targetPrice: number | null
  costUsd: number
  lastClose: number | null
  valueUsd: number | null
  unrealizedUsd: number | null
  openedAt: string
  hoursOpen: number
}

export interface PortfolioSnapshot {
  initialUsd: number
  cashUsd: number
  equityUsd: number
  positions: PositionView[]
}

/** Caja, posiciones abiertas valoradas al último cierre y patrimonio total. */
export async function snapshot(): Promise<PortfolioSnapshot> {
  const p = await ensurePortfolio()
  const open = await db.select().from(ordersSim).where(eq(ordersSim.status, 'open')).orderBy(asc(ordersSim.openedAt))
  const positions: PositionView[] = []
  let equity = n(p.cashUsd)
  for (const o of open) {
    const last = await latestCandle(o.symbol)
    const qty = n(o.qty)
    const cost = n(o.sizeUsd) + n(o.feesUsd)
    const value = last ? qty * last.close : null
    if (value != null) equity += value
    positions.push({
      id: o.id,
      symbol: o.symbol,
      qty,
      entryPrice: n(o.entryPrice),
      stopPrice: n(o.stopPrice),
      targetPrice: o.targetPrice == null ? null : n(o.targetPrice),
      costUsd: cost,
      lastClose: last?.close ?? null,
      valueUsd: value,
      unrealizedUsd: value == null ? null : value - cost,
      openedAt: o.openedAt.toISOString(),
      hoursOpen: Math.floor((Date.now() - o.openedAt.getTime()) / 3_600_000),
    })
  }
  return { initialUsd: n(p.initialUsd), cashUsd: n(p.cashUsd), equityUsd: equity, positions }
}

export interface NewOrder {
  sessionId: string
  symbol: string
  sizeUsd: number
  stopPrice: number
  targetPrice: number | null
  maxHoursOpen: number
  conditions: string | null
  createdBy: string
}

/**
 * Ejecuta una compra al último cierre guardado (slippage + comisión) y la registra.
 * Rechaza (fila `rejected`) si la orden no pasa la validación.
 */
export async function openOrder(input: NewOrder): Promise<OrderSim> {
  const p = await ensurePortfolio()
  const last = await latestCandle(input.symbol)
  const cash = n(p.cashUsd)
  const reason = last ? validateOrder({ ...input, close: last.close }, cash) : `sin velas para ${input.symbol}`
  const base = {
    id: crypto.randomUUID(),
    sessionId: input.sessionId,
    symbol: input.symbol,
    sizeUsd: s(input.sizeUsd),
    stopPrice: s(input.stopPrice),
    targetPrice: input.targetPrice == null ? null : s(input.targetPrice),
    maxHoursOpen: input.maxHoursOpen,
    conditions: input.conditions,
    createdBy: input.createdBy,
  }
  if (reason || !last) {
    const [rejected] = await db
      .insert(ordersSim)
      .values({ ...base, qty: '0', entryPrice: '0', referencePrice: s(last?.close ?? 0), feesUsd: '0', status: 'rejected', exitReason: null, closedAt: new Date(), conditions: `RECHAZADA: ${reason}${input.conditions ? ` · ${input.conditions}` : ''}` })
      .returning()
    return rejected
  }
  const fill = fillBuy(input.sizeUsd, last.close)
  await setCash(cash - fill.cashOut)
  try {
    const [order] = await db
      .insert(ordersSim)
      .values({ ...base, qty: s(fill.qty), entryPrice: s(fill.entryPrice), referencePrice: s(last.close), feesUsd: s(fill.feesUsd), status: 'open' })
      .returning()
    return order
  } catch (err) {
    await setCash(cash) // deshacer la caja si no se pudo registrar
    throw err
  }
}

export interface ClosedPosition {
  order: OrderSim
  reason: 'stop' | 'target' | 'expired' | 'manual'
  pnlUsd: number
}

/** Cierra una posición al último cierre guardado y devuelve el dinero a la caja. */
export async function closePosition(order: OrderSim, reason: ClosedPosition['reason'], candle?: Candle | null): Promise<ClosedPosition> {
  const last = candle ?? (await latestCandle(order.symbol))
  if (!last) throw new Error(`sin velas para ${order.symbol}`)
  const cost = n(order.sizeUsd) + n(order.feesUsd)
  const exit = fillSell(n(order.qty), last.close, cost)
  const p = await ensurePortfolio()
  await setCash(n(p.cashUsd) + exit.cashIn)
  const [updated] = await db
    .update(ordersSim)
    .set({ status: 'closed', closedAt: new Date(), exitPrice: s(exit.exitPrice), exitReason: reason, pnlUsd: s(exit.pnlUsd), feesUsd: s(n(order.feesUsd) + exit.feesUsd) })
    .where(and(eq(ordersSim.id, order.id), eq(ordersSim.status, 'open')))
    .returning()
  return { order: updated ?? order, reason, pnlUsd: exit.pnlUsd }
}

/** Revisa cada posición abierta contra su última vela cerrada: stop, objetivo o caducidad. */
export async function manageOpenPositions(): Promise<ClosedPosition[]> {
  const open = await db.select().from(ordersSim).where(eq(ordersSim.status, 'open'))
  const closed: ClosedPosition[] = []
  for (const o of open) {
    const last = await latestCandle(o.symbol)
    if (!last) continue
    const check = checkExit({ stopPrice: n(o.stopPrice), targetPrice: o.targetPrice == null ? null : n(o.targetPrice), maxHoursOpen: o.maxHoursOpen, openedAt: o.openedAt.getTime() }, last)
    if (check.exit) closed.push(await closePosition(o, check.reason, last))
  }
  return closed
}

/** Órdenes recientes (para el panel y el Profesor). */
export async function recentOrders(limit = 50): Promise<OrderSim[]> {
  return db.select().from(ordersSim).orderBy(desc(ordersSim.openedAt)).limit(limit)
}
