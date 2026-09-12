import type { Candle } from './sim'

/**
 * Velas horarias desde APIs públicas sin clave (comprobado 2026-09-12):
 * Coinbase Exchange primero, Kraken de respaldo. Binance bloquea por región.
 */

const TIMEOUT_MS = 10_000

const COINBASE_PRODUCT: Record<string, string> = { 'BTC-USD': 'BTC-USD', 'ETH-USD': 'ETH-USD' }
const KRAKEN_PAIR: Record<string, string> = { 'BTC-USD': 'XBTUSD', 'ETH-USD': 'ETHUSD' }

/** Coinbase devuelve [time(s), low, high, open, close, volume], más reciente primero. */
export function parseCoinbase(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) throw new Error('Coinbase: respuesta inesperada')
  return raw
    .map((r) => {
      const [t, low, high, open, close, volume] = r as number[]
      return { ts: t * 1000, open, high, low, close, volume }
    })
    .sort((a, b) => a.ts - b.ts)
}

/** Kraken devuelve result[pair] = [[time(s), open, high, low, close, vwap, volume, count], …], más antiguo primero. */
export function parseKraken(raw: unknown, pair: string): Candle[] {
  const r = raw as { error?: string[]; result?: Record<string, unknown[]> }
  if (r.error?.length) throw new Error(`Kraken: ${r.error.join(', ')}`)
  // Kraken responde con su nombre interno del par (XBTUSD → XXBTZUSD): la única clave que no es `last`.
  const rows = r.result ? Object.entries(r.result).find(([k]) => k !== 'last')?.[1] : undefined
  if (!rows) throw new Error(`Kraken: sin datos para ${pair}`)
  return rows.map((row) => {
    const [t, open, high, low, close, , volume] = row as (string | number)[]
    return { ts: Number(t) * 1000, open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: Number(volume) }
  })
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json', 'user-agent': 'la-banda/0.2' }, cache: 'no-store' })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

export interface CandleFetch {
  candles: Candle[]
  source: 'coinbase' | 'kraken'
}

/**
 * Últimas `limit` velas horarias CERRADAS del símbolo (se descarta la vela en curso).
 */
export async function fetchHourlyCandles(symbol: string, limit = 120): Promise<CandleFetch> {
  const errors: string[] = []
  try {
    const product = COINBASE_PRODUCT[symbol]
    if (!product) throw new Error(`símbolo desconocido ${symbol}`)
    const raw = await getJson(`https://api.exchange.coinbase.com/products/${product}/candles?granularity=3600`)
    return { candles: dropCurrent(parseCoinbase(raw)).slice(-limit), source: 'coinbase' }
  } catch (err) {
    errors.push(`coinbase: ${err instanceof Error ? err.message : String(err)}`)
  }
  try {
    const pair = KRAKEN_PAIR[symbol]
    if (!pair) throw new Error(`símbolo desconocido ${symbol}`)
    const raw = await getJson(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=60`)
    return { candles: dropCurrent(parseKraken(raw, pair)).slice(-limit), source: 'kraken' }
  } catch (err) {
    errors.push(`kraken: ${err instanceof Error ? err.message : String(err)}`)
  }
  throw new Error(`Sin velas para ${symbol}: ${errors.join(' | ')}`)
}

/** Quita la vela cuya hora aún no ha terminado. */
export function dropCurrent(candles: Candle[], now = Date.now()): Candle[] {
  const currentOpen = Math.floor(now / 3_600_000) * 3_600_000
  return candles.filter((c) => c.ts < currentOpen)
}
