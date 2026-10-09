import type { Candle } from './sim'

/**
 * Velas horarias desde APIs públicas sin clave (comprobado 2026-09-12):
 * Coinbase Exchange primero, Kraken de respaldo. Binance bloquea por región.
 */

const TIMEOUT_MS = 10_000

// La mesa opera BTC/ETH/DASH (USD). El par BTC-EUR y MON-USD los usa solo «Mi cartera»
// para valorar en € (MON no se opera; BTC-EUR da el tipo €/USD implícito).
const COINBASE_PRODUCT: Record<string, string> = {
  'BTC-USD': 'BTC-USD',
  'ETH-USD': 'ETH-USD',
  'DASH-USD': 'DASH-USD',
  'MON-USD': 'MON-USD',
  'BTC-EUR': 'BTC-EUR',
}
const KRAKEN_PAIR: Record<string, string> = {
  'BTC-USD': 'XBTUSD',
  'ETH-USD': 'ETHUSD',
  'DASH-USD': 'DASHUSD',
  'MON-USD': 'MONUSD',
  'BTC-EUR': 'XBTEUR',
}

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
 * Últimas `limit` velas CERRADAS del símbolo en la granularidad dada (se descarta la vela en curso).
 * Coinbase usa segundos (`granularity`); Kraken usa minutos (`interval`).
 */
export async function fetchCandles(symbol: string, { granularitySec, limit }: { granularitySec: number; limit: number }): Promise<CandleFetch> {
  const bucketMs = granularitySec * 1000
  const errors: string[] = []
  try {
    const product = COINBASE_PRODUCT[symbol]
    if (!product) throw new Error(`símbolo desconocido ${symbol}`)
    const raw = await getJson(`https://api.exchange.coinbase.com/products/${product}/candles?granularity=${granularitySec}`)
    return { candles: dropCurrent(parseCoinbase(raw), bucketMs).slice(-limit), source: 'coinbase' }
  } catch (err) {
    errors.push(`coinbase: ${err instanceof Error ? err.message : String(err)}`)
  }
  try {
    const pair = KRAKEN_PAIR[symbol]
    if (!pair) throw new Error(`símbolo desconocido ${symbol}`)
    const raw = await getJson(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${Math.round(granularitySec / 60)}`)
    return { candles: dropCurrent(parseKraken(raw, pair), bucketMs).slice(-limit), source: 'kraken' }
  } catch (err) {
    errors.push(`kraken: ${err instanceof Error ? err.message : String(err)}`)
  }
  throw new Error(`Sin velas para ${symbol}: ${errors.join(' | ')}`)
}

/** Últimas `limit` velas HORARIAS cerradas. */
export function fetchHourlyCandles(symbol: string, limit = 120): Promise<CandleFetch> {
  return fetchCandles(symbol, { granularitySec: 3600, limit })
}

/** Últimas `limit` velas DIARIAS cerradas (para el estudio de tendencia). */
export function fetchDailyCandles(symbol: string, limit = 250): Promise<CandleFetch> {
  return fetchCandles(symbol, { granularitySec: 86400, limit })
}

/** Quita la vela cuyo periodo aún no ha terminado (bucket por defecto: 1 h). */
export function dropCurrent(candles: Candle[], bucketMs = 3_600_000, now = Date.now()): Candle[] {
  const currentOpen = Math.floor(now / bucketMs) * bucketMs
  return candles.filter((c) => c.ts < currentOpen)
}
