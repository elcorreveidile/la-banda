/**
 * «Mi cartera»: valora las tenencias REALES del usuario (no el fondo simulado).
 *
 * Decidido con Javier: partimos de lo que tiene (sin precio de compra), así que `refPriceUsd` es el
 * cierre USD al registrar cada tenencia y la «variación» se mide desde ahí. Importes en €, pero las
 * fuentes cotizan en USD; Coinbase solo tiene par EUR para BTC/ETH, así que el **€/USD se deriva de
 * BTC** (`BTC-EUR / BTC-USD`) y se aplica a todo. Sin API de divisas. Mejor esfuerzo: si una fuente
 * falla, esa fila queda sin valor (null), no rompe la página.
 *
 * `impliedEurUsd` y `calcHolding` son PUROS (testeables sin red ni BD).
 */
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { cryptoCartera } from '@/db/trading'
import { latestCandle } from './portfolio'
import { fetchHourlyCandles } from './candles'

/** Símbolos que «Mi cartera» sabe valorar (tienen velas en Coinbase/Kraken). MON no se opera. */
export const CARTERA_SIMBOLOS = ['BTC-USD', 'ETH-USD', 'DASH-USD', 'MON-USD'] as const
export type CarteraSimbolo = (typeof CARTERA_SIMBOLOS)[number]

/** Base del símbolo para mostrar (BTC-USD → BTC). */
export function baseSimbolo(symbol: string): string {
  return symbol.split('-')[0]
}

export interface HoldingValorado {
  symbol: string
  unidades: number
  refPriceUsd: number
  precioActualUsd: number | null
  valorEur: number | null
  refValorEur: number | null
  /** Variación de precio (USD) desde que se registró; null si no hay precio actual. */
  pct: number | null
}

export interface CarteraValorada {
  holdings: HoldingValorado[]
  valorEur: number | null
  refValorEur: number | null
  pct: number | null
  eurUsd: number | null
}

/** Tipo €/USD implícito de BTC (BTC-EUR ÷ BTC-USD). null si falta algún dato. */
export function impliedEurUsd(btcEurClose: number | null, btcUsdClose: number | null): number | null {
  if (btcEurClose == null || btcUsdClose == null || btcUsdClose <= 0) return null
  const r = btcEurClose / btcUsdClose
  return Number.isFinite(r) && r > 0 ? r : null
}

/** Valora una tenencia: valor en € (coste escalado por precio), variación % (USD) desde el registro. */
export function calcHolding(
  unidades: number,
  refPriceUsd: number,
  lastUsd: number | null,
  eurUsd: number | null,
): { precioActualUsd: number | null; pct: number | null; valorEur: number | null; refValorEur: number | null } {
  const precioActualUsd = lastUsd != null && Number.isFinite(lastUsd) && lastUsd > 0 ? lastUsd : null
  const pct = precioActualUsd != null && refPriceUsd > 0 ? precioActualUsd / refPriceUsd - 1 : null
  const valorEur = precioActualUsd != null && eurUsd != null ? unidades * precioActualUsd * eurUsd : null
  const refValorEur = eurUsd != null && refPriceUsd > 0 ? unidades * refPriceUsd * eurUsd : null
  return { precioActualUsd, pct, valorEur, refValorEur }
}

/** Último cierre en vivo de un símbolo (una vela). null si falla. */
export async function cierreEnVivo(symbol: string): Promise<number | null> {
  try {
    const { candles } = await fetchHourlyCandles(symbol, 1)
    return candles.at(-1)?.close ?? null
  } catch {
    return null
  }
}

/** Último cierre USD: primero de la BD (lo guarda el ciclo para BTC/ETH/DASH), si no, en vivo. */
async function cierreUsd(symbol: string): Promise<number | null> {
  const c = await latestCandle(symbol).catch(() => null)
  if (c) return c.close
  return cierreEnVivo(symbol)
}

/** Valora todas las tenencias del usuario. */
export async function valorarCartera(owner: string): Promise<CarteraValorada> {
  const rows = await db.select().from(cryptoCartera).where(eq(cryptoCartera.owner, owner))
  // €/USD implícito: BTC-USD y BTC-EUR en vivo (para que casen en el tiempo).
  const [btcUsd, btcEur] = await Promise.all([cierreEnVivo('BTC-USD'), cierreEnVivo('BTC-EUR')])
  const eurUsd = impliedEurUsd(btcEur, btcUsd)

  const holdings: HoldingValorado[] = []
  for (const row of rows) {
    const unidades = Number(row.unidades)
    const refPriceUsd = Number(row.refPriceUsd)
    const lastUsd = row.symbol === 'BTC-USD' ? btcUsd : await cierreUsd(row.symbol)
    const c = calcHolding(unidades, refPriceUsd, lastUsd, eurUsd)
    holdings.push({ symbol: row.symbol, unidades, refPriceUsd, ...c })
  }
  holdings.sort((a, b) => (b.valorEur ?? 0) - (a.valorEur ?? 0))

  const anyVal = holdings.some((h) => h.valorEur != null)
  const valorEur = anyVal ? holdings.reduce((a, h) => a + (h.valorEur ?? 0), 0) : null
  const refValorEur = holdings.reduce((a, h) => a + (h.refValorEur ?? 0), 0)
  const pct = valorEur != null && refValorEur > 0 ? valorEur / refValorEur - 1 : null
  return { holdings, valorEur, refValorEur: refValorEur > 0 ? refValorEur : null, pct, eurUsd }
}
