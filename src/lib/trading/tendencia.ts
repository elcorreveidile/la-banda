/**
 * Estudio de tendencia (marco diario): segunda lente sobre la mesa, que solo mira velas horarias.
 * Variación 7/30/90 días, medias móviles (20/50/200) y dirección (alcista/lateral/bajista).
 *
 * `calcTendencia` es PURO (testeable sin red). `tendenciasDe` descarga velas diarias y es mejor
 * esfuerzo: un símbolo sin datos devuelve null, nunca rompe.
 */
import { fetchDailyCandles } from './candles'

export type Direccion = 'alcista' | 'lateral' | 'bajista'

export interface Tendencia {
  precio: number
  cambio7: number | null
  cambio30: number | null
  cambio90: number | null
  sma20: number | null
  sma50: number | null
  sma200: number | null
  direccion: Direccion
}

/** Media de los últimos `n` cierres, o null si no hay suficientes. */
function sma(closes: number[], n: number): number | null {
  if (closes.length < n) return null
  let s = 0
  for (let i = closes.length - n; i < closes.length; i++) s += closes[i]
  return s / n
}

/** Variación entre el último cierre y el de hace `n` días (cierres diarios, uno por día). */
function cambio(closes: number[], n: number): number | null {
  if (closes.length < n + 1) return null
  const prev = closes[closes.length - 1 - n]
  if (!(prev > 0)) return null
  return closes[closes.length - 1] / prev - 1
}

/** Calcula la tendencia a partir de cierres diarios en orden cronológico (antiguo → reciente). */
export function calcTendencia(dailyCloses: number[]): Tendencia | null {
  const closes = dailyCloses.filter((c) => Number.isFinite(c) && c > 0)
  if (!closes.length) return null
  const precio = closes[closes.length - 1]
  const sma20 = sma(closes, 20)
  const sma50 = sma(closes, 50)
  const sma200 = sma(closes, 200)
  const cambio30 = cambio(closes, 30)

  let direccion: Direccion = 'lateral'
  if (sma50 != null && sma200 != null) {
    if (precio > sma50 && sma50 > sma200) direccion = 'alcista'
    else if (precio < sma50 && sma50 < sma200) direccion = 'bajista'
  } else if (sma50 != null) {
    // Serie corta (sin sma200): decidir con la media de 50 y el signo del mes.
    if (precio > sma50 && (cambio30 ?? 0) > 0) direccion = 'alcista'
    else if (precio < sma50 && (cambio30 ?? 0) < 0) direccion = 'bajista'
  }

  return { precio, cambio7: cambio(closes, 7), cambio30, cambio90: cambio(closes, 90), sma20, sma50, sma200, direccion }
}

/** Tendencia por símbolo (mejor esfuerzo; símbolo sin datos → null). */
export async function tendenciasDe(symbols: readonly string[]): Promise<Record<string, Tendencia | null>> {
  const entradas = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const { candles } = await fetchDailyCandles(symbol, 250)
        return [symbol, calcTendencia(candles.map((c) => c.close))] as const
      } catch {
        return [symbol, null] as const
      }
    }),
  )
  return Object.fromEntries(entradas)
}
