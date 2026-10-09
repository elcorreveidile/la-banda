/**
 * Riesgo de «Mi cartera»: mira el conjunto, no cada moneda por separado. Avisa de concentración
 * (una sola moneda demasiado grande, o dos que copan casi todo) y sugiere repartir. PURO y testeable.
 */
import type { CarteraValorada } from './cartera'

const base = (symbol: string) => symbol.split('-')[0]

/** Umbrales de concentración. */
const MAX_UNA = 0.4 // una moneda > 40 %
const MAX_DOS = 0.75 // top-2 > 75 % (dos monedas copan casi todo)

export interface RiesgoCartera {
  pesos: { symbol: string; pct: number }[]
  mayor: { symbol: string; pct: number } | null
  concentrado: boolean
  aviso: string | null
  /** Reparto concreto: cuánto € habría que mover para bajar al peso objetivo (umbral). */
  sugerencia: { excesoEur: number; objetivoPct: number } | null
}

export function analizarRiesgo(cartera: CarteraValorada): RiesgoCartera {
  const conValor = cartera.holdings.filter((h) => h.valorEur != null && h.valorEur > 0) as { symbol: string; valorEur: number }[]
  const total = conValor.reduce((a, h) => a + h.valorEur, 0)
  if (total <= 0) return { pesos: [], mayor: null, concentrado: false, aviso: null, sugerencia: null }

  const pesos = conValor.map((h) => ({ symbol: h.symbol, pct: h.valorEur / total })).sort((a, b) => b.pct - a.pct)
  const mayor = pesos[0] ?? null
  const top2 = (pesos[0]?.pct ?? 0) + (pesos[1]?.pct ?? 0)
  const concentrado = (mayor?.pct ?? 0) > MAX_UNA || top2 > MAX_DOS

  let aviso: string | null = null
  let sugerencia: RiesgoCartera['sugerencia'] = null
  if (concentrado && mayor) {
    const pctTxt = (p: number) => `${(p * 100).toFixed(0)} %`
    const eurTxt = (v: number) => `${Math.round(v)} €`
    if (mayor.pct > MAX_UNA) {
      // Una sola moneda demasiado grande: cuánto € bajarla para volver al tope.
      const excesoEur = total * (mayor.pct - MAX_UNA)
      sugerencia = { excesoEur, objetivoPct: MAX_UNA }
      aviso = `${base(mayor.symbol)} es el ${pctTxt(mayor.pct)} de tu cartera (${eurTxt(total * mayor.pct)}): una sola moneda tan grande concentra el riesgo. Para bajar al ${pctTxt(MAX_UNA)}, moverías ~${eurTxt(excesoEur)} a otras posiciones.`
    } else {
      // Dos monedas copan casi todo: cuánto € repartir para volver al tope de top-2.
      const excesoEur = total * (top2 - MAX_DOS)
      sugerencia = { excesoEur, objetivoPct: MAX_DOS }
      aviso = `${base(pesos[0].symbol)} y ${base(pesos[1].symbol)} son el ${pctTxt(top2)} de tu cartera (${eurTxt(total * top2)}): muy concentrada en dos monedas. Para bajar al ${pctTxt(MAX_DOS)}, moverías ~${eurTxt(excesoEur)} al resto.`
    }
  }
  return { pesos, mayor, concentrado, aviso, sugerencia }
}
