import { describe, expect, it } from 'vitest'
import { analizarRiesgo } from '@/lib/trading/riesgo'
import type { CarteraValorada } from '@/lib/trading/cartera'

function cartera(valores: Record<string, number | null>): CarteraValorada {
  const holdings = Object.entries(valores).map(([symbol, valorEur]) => ({
    symbol,
    unidades: 1,
    refPriceUsd: 1,
    precioActualUsd: 1,
    valorEur,
    refValorEur: valorEur,
    pct: 0,
  }))
  return { holdings, valorEur: null, refValorEur: null, pct: null, eurUsd: 0.92 }
}

describe('analizarRiesgo', () => {
  it('sin valores → sin aviso', () => {
    const r = analizarRiesgo(cartera({ 'BTC-USD': null, 'ETH-USD': null }))
    expect(r.concentrado).toBe(false)
    expect(r.aviso).toBeNull()
    expect(r.sugerencia).toBeNull()
    expect(r.pesos).toEqual([])
  })

  it('una moneda > 40 % concentra con reparto concreto (cartera real de Javier)', () => {
    const r = analizarRiesgo(cartera({ 'DASH-USD': 260.19, 'BTC-USD': 241.27, 'ETH-USD': 25.36, 'MON-USD': 0.25 }))
    expect(r.mayor?.symbol).toBe('DASH-USD')
    expect(r.mayor!.pct).toBeGreaterThan(0.4)
    expect(r.concentrado).toBe(true)
    expect(r.aviso).toMatch(/DASH/)
    // reparto concreto: bajar DASH al 40 % moviendo el exceso en €
    expect(r.sugerencia?.objetivoPct).toBe(0.4)
    const total = 260.19 + 241.27 + 25.36 + 0.25 // 527.07
    expect(r.sugerencia!.excesoEur).toBeCloseTo(260.19 - total * 0.4, 6) // ≈ 49,36 €
    expect(r.aviso).toMatch(/40 %/)
    expect(r.aviso).toMatch(/\d+ €/)
    // pesos ordenados de mayor a menor y suman ~1
    expect(r.pesos[0].symbol).toBe('DASH-USD')
    expect(r.pesos.reduce((a, p) => a + p.pct, 0)).toBeCloseTo(1, 6)
  })

  it('repartida (ninguna > 40 % ni top-2 > 75 %) → sin aviso', () => {
    const r = analizarRiesgo(cartera({ 'BTC-USD': 30, 'ETH-USD': 30, 'DASH-USD': 25, 'MON-USD': 15 }))
    expect(r.concentrado).toBe(false)
    expect(r.aviso).toBeNull()
    expect(r.sugerencia).toBeNull()
  })

  it('top-2 > 75 % (sin que ninguna pase de 40) concentra con reparto al 75 %', () => {
    const r = analizarRiesgo(cartera({ 'BTC-USD': 39, 'ETH-USD': 39, 'DASH-USD': 12, 'MON-USD': 10 }))
    expect(r.mayor!.pct).toBeLessThanOrEqual(0.4)
    expect(r.concentrado).toBe(true)
    expect(r.aviso).toMatch(/BTC.*ETH|ETH.*BTC/)
    expect(r.sugerencia?.objetivoPct).toBe(0.75)
    expect(r.sugerencia!.excesoEur).toBeCloseTo((39 + 39) - 100 * 0.75, 6) // 78 − 75 = 3 €
  })
})
