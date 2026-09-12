import { describe, expect, it } from 'vitest'
import { checkExit, fillBuy, fillSell, validateOrder, volatility, FEE, SLIPPAGE } from '@/lib/trading/sim'
import { dropCurrent, parseCoinbase, parseKraken } from '@/lib/trading/candles'

describe('simulación', () => {
  it('compra al cierre con slippage y comisión', () => {
    const f = fillBuy(50, 1000)
    expect(f.entryPrice).toBeCloseTo(1000 * (1 + SLIPPAGE))
    expect(f.feesUsd).toBeCloseTo(50 * FEE)
    expect(f.qty).toBeCloseTo(50 / 1003)
    expect(f.cashOut).toBeCloseTo(50.05)
  })

  it('vende al cierre con slippage en contra y comisión; pnl neto', () => {
    const buy = fillBuy(50, 1000)
    const sell = fillSell(buy.qty, 1100, buy.cashOut)
    expect(sell.exitPrice).toBeCloseTo(1100 * (1 - SLIPPAGE))
    const gross = buy.qty * sell.exitPrice
    expect(sell.cashIn).toBeCloseTo(gross * (1 - FEE))
    expect(sell.pnlUsd).toBeCloseTo(sell.cashIn - buy.cashOut)
    expect(sell.pnlUsd).toBeGreaterThan(0)
    // ida y vuelta al mismo precio pierde slippage + comisiones
    const flat = fillSell(buy.qty, 1000, buy.cashOut)
    expect(flat.pnlUsd).toBeLessThan(0)
  })

  it('salida por stop, objetivo o caducidad al cierre', () => {
    const pos = { stopPrice: 900, targetPrice: 1200, maxHoursOpen: 4, openedAt: 0 }
    const c = (close: number, ts = 3_600_000) => ({ ts, open: close, high: close, low: close, close, volume: 1 })
    expect(checkExit(pos, c(950))).toEqual({ exit: false })
    expect(checkExit(pos, c(900))).toEqual({ exit: true, reason: 'stop' })
    expect(checkExit(pos, c(1250))).toEqual({ exit: true, reason: 'target' })
    expect(checkExit(pos, c(1000, 4 * 3_600_000))).toEqual({ exit: true, reason: 'expired' })
    expect(checkExit({ ...pos, targetPrice: null, maxHoursOpen: 0 }, c(5000, 99 * 3_600_000))).toEqual({ exit: false })
  })

  it('valida órdenes contra la caja y los niveles', () => {
    const base = { symbol: 'BTC-USD', sizeUsd: 40, stopPrice: 900, targetPrice: 1100, close: 1000 }
    expect(validateOrder(base, 100)).toBeNull()
    expect(validateOrder({ ...base, symbol: 'DOGE-USD' }, 100)).toMatch(/símbolo/)
    expect(validateOrder({ ...base, sizeUsd: 100 }, 100)).toMatch(/supera la caja/)
    expect(validateOrder({ ...base, stopPrice: 1000 }, 100)).toMatch(/stop/)
    expect(validateOrder({ ...base, targetPrice: 999 }, 100)).toMatch(/objetivo/)
    expect(validateOrder({ ...base, targetPrice: null }, 100)).toBeNull()
  })

  it('volatilidad de retornos', () => {
    const flat = Array.from({ length: 10 }, (_, i) => ({ ts: i, open: 1, high: 1, low: 1, close: 100, volume: 1 }))
    expect(volatility(flat)).toBe(0)
    const wobbly = flat.map((c, i) => ({ ...c, close: i % 2 ? 110 : 100 }))
    expect(volatility(wobbly)).toBeGreaterThan(0.04)
  })
})

describe('velas', () => {
  it('normaliza Coinbase (más reciente primero → orden cronológico)', () => {
    const raw = [
      [7200, 9, 11, 10, 10.5, 3],
      [3600, 8, 10, 9, 10, 2],
    ]
    const c = parseCoinbase(raw)
    expect(c.map((x) => x.ts)).toEqual([3_600_000, 7_200_000])
    expect(c[0]).toEqual({ ts: 3_600_000, open: 9, high: 10, low: 8, close: 10, volume: 2 })
  })

  it('normaliza Kraken', () => {
    const raw = { error: [], result: { XXBTZUSD: [[3600, '1', '2', '0.5', '1.5', '1.2', '7', 3]], last: 3600 } }
    const c = parseKraken(raw, 'XBTUSD')
    expect(c).toEqual([{ ts: 3_600_000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 7 }])
    expect(() => parseKraken({ error: ['EQuery:Unknown asset pair'] }, 'XBTUSD')).toThrow(/Kraken/)
  })

  it('descarta la vela en curso', () => {
    const now = 10 * 3_600_000 + 1234
    const c = [8, 9, 10].map((h) => ({ ts: h * 3_600_000, open: 1, high: 1, low: 1, close: 1, volume: 1 }))
    expect(dropCurrent(c, now).map((x) => x.ts / 3_600_000)).toEqual([8, 9])
  })
})
