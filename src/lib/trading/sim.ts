/**
 * Simulación pura de la cartera (sin base de datos):
 * ejecución al cierre de la vela con slippage fijo y comisión.
 * Todo en USD; cantidades en unidades del activo.
 */

export const INITIAL_USD = 100
export const SLIPPAGE = 0.003 // 0,3 %
export const FEE = 0.001 // 0,1 %
export const SYMBOLS = ['BTC-USD', 'ETH-USD'] as const
export type Symbol = (typeof SYMBOLS)[number]

export interface Candle {
  /** Apertura de la vela, ms desde epoch (UTC). */
  ts: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Fill {
  qty: number
  entryPrice: number
  feesUsd: number
  /** Dinero que sale de la caja (importe + comisión). */
  cashOut: number
}

/** Compra `sizeUsd` al cierre `close`: paga slippage y comisión sobre el importe. */
export function fillBuy(sizeUsd: number, close: number): Fill {
  if (!(sizeUsd > 0) || !(close > 0)) throw new Error('importe y precio deben ser positivos')
  const entryPrice = close * (1 + SLIPPAGE)
  const feesUsd = sizeUsd * FEE
  const qty = sizeUsd / entryPrice
  return { qty, entryPrice, feesUsd, cashOut: sizeUsd + feesUsd }
}

export interface Exit {
  exitPrice: number
  feesUsd: number
  /** Dinero que vuelve a la caja (neto de comisión). */
  cashIn: number
  pnlUsd: number
}

/** Vende `qty` al cierre `close` (slippage en contra, comisión sobre el importe). */
export function fillSell(qty: number, close: number, costBasisUsd: number): Exit {
  if (!(qty > 0) || !(close > 0)) throw new Error('cantidad y precio deben ser positivos')
  const exitPrice = close * (1 - SLIPPAGE)
  const gross = qty * exitPrice
  const feesUsd = gross * FEE
  const cashIn = gross - feesUsd
  return { exitPrice, feesUsd, cashIn, pnlUsd: cashIn - costBasisUsd }
}

export interface OpenPosition {
  stopPrice: number
  targetPrice: number | null
  maxHoursOpen: number
  openedAt: number
}

export type ExitCheck = { exit: false } | { exit: true; reason: 'stop' | 'target' | 'expired' }

/**
 * Decide si una posición debe cerrarse con la última vela cerrada.
 * Reglas al cierre (no intravela): stop si close <= stop; objetivo si close >= target;
 * caducidad si lleva más de `maxHoursOpen` horas abierta.
 */
export function checkExit(pos: OpenPosition, candle: Candle): ExitCheck {
  if (candle.close <= pos.stopPrice) return { exit: true, reason: 'stop' }
  if (pos.targetPrice != null && candle.close >= pos.targetPrice) return { exit: true, reason: 'target' }
  if (pos.maxHoursOpen > 0 && candle.ts - pos.openedAt >= pos.maxHoursOpen * 3_600_000) return { exit: true, reason: 'expired' }
  return { exit: false }
}

/** Valida una orden propuesta contra la caja y los niveles. Devuelve el motivo del rechazo o null. */
export function validateOrder(o: { symbol: string; sizeUsd: number; stopPrice: number; targetPrice: number | null; close: number }, cashUsd: number): string | null {
  if (!(SYMBOLS as readonly string[]).includes(o.symbol)) return `símbolo no permitido: ${o.symbol}`
  if (!(o.sizeUsd > 0)) return 'importe no positivo'
  if (o.sizeUsd * (1 + FEE) > cashUsd + 1e-9) return `importe ${o.sizeUsd.toFixed(2)} USD supera la caja (${cashUsd.toFixed(2)} USD con comisión)`
  if (!(o.stopPrice > 0) || o.stopPrice >= o.close) return 'el stop debe estar por debajo del precio de entrada'
  if (o.targetPrice != null && o.targetPrice <= o.close) return 'el objetivo debe estar por encima del precio de entrada'
  return null
}

/** Volatilidad simple: desviación típica de los retornos de cierre a cierre, en tanto por uno. */
export function volatility(candles: Candle[]): number {
  if (candles.length < 3) return 0
  const rets: number[] = []
  for (let i = 1; i < candles.length; i++) rets.push(candles[i].close / candles[i - 1].close - 1)
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  const varr = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length
  return Math.sqrt(varr)
}
