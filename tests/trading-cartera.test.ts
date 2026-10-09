import { describe, expect, it } from 'vitest'
import { calcHolding, impliedEurUsd, sparklinePath, hoyUTC, type CarteraValorada } from '@/lib/trading/cartera'
import { componerResumenTrading } from '@/lib/trading/recomendaciones'

describe('impliedEurUsd', () => {
  it('es el ratio BTC-EUR / BTC-USD', () => {
    expect(impliedEurUsd(74208, 80660)).toBeCloseTo(0.92, 2)
  })
  it('null si falta algún dato o el denominador no es positivo', () => {
    expect(impliedEurUsd(null, 80000)).toBeNull()
    expect(impliedEurUsd(74000, null)).toBeNull()
    expect(impliedEurUsd(74000, 0)).toBeNull()
  })
})

describe('calcHolding', () => {
  it('valora en € y mide la variación en % desde el precio de referencia (USD)', () => {
    const r = calcHolding(0.0032, 70000, 75000, 0.92)
    expect(r.precioActualUsd).toBe(75000)
    expect(r.pct).toBeCloseTo(75000 / 70000 - 1, 6)
    expect(r.valorEur).toBeCloseTo(0.0032 * 75000 * 0.92, 6)
    expect(r.refValorEur).toBeCloseTo(0.0032 * 70000 * 0.92, 6)
  })
  it('sin precio actual → todo null', () => {
    const r = calcHolding(5.71, 50, null, 0.92)
    expect(r).toMatchObject({ precioActualUsd: null, pct: null, valorEur: null })
  })
  it('sin €/USD → valor € null pero la variación % se mantiene', () => {
    const r = calcHolding(1, 100, 110, null)
    expect(r.valorEur).toBeNull()
    expect(r.refValorEur).toBeNull()
    expect(r.pct).toBeCloseTo(0.1, 6)
  })
})

describe('componerResumenTrading con cartera personal', () => {
  const carteraPersonal: CarteraValorada = {
    holdings: [
      { symbol: 'DASH-USD', unidades: 5.71, refPriceUsd: 50, precioActualUsd: 51, valorEur: 260.19, refValorEur: 255, pct: 0.02 },
      { symbol: 'MON-USD', unidades: 11.57, refPriceUsd: 0.0246, precioActualUsd: 0.024, valorEur: 0.25, refValorEur: 0.26, pct: -0.02 },
    ],
    valorEur: 260.44,
    refValorEur: 255.26,
    pct: 0.0203,
    eurUsd: 0.92,
  }

  it('incluye el bloque «Mi cartera» con el total y las tenencias', () => {
    const correo = componerResumenTrading({
      ciclo: '2026-10-09T07:00:00.000Z',
      recomendaciones: [{ symbol: 'BTC-USD', accion: 'mantener', confianza: 'media', entrada: null, stop: null, objetivo: null, horizonte: null, motivo: 'lateral' }],
      carteraPersonal,
    })
    expect(correo).not.toBeNull()
    expect(correo!.texto).toContain('Mi cartera: 260.44 €')
    expect(correo!.texto).toContain('DASH 5.71 → 260.19 €')
    expect(correo!.html).toContain('Mi cartera: 260.44 €')
    expect(correo!.html).toContain('DASH')
  })

  it('sin cartera personal no rompe (sigue saliendo si hay recomendaciones)', () => {
    const correo = componerResumenTrading({
      ciclo: null,
      recomendaciones: [{ symbol: 'ETH-USD', accion: 'fuera', confianza: 'baja', entrada: null, stop: null, objetivo: null, horizonte: null, motivo: 'sin setup' }],
    })
    expect(correo).not.toBeNull()
    expect(correo!.texto).not.toContain('Mi cartera')
  })
})

describe('historial / sparkline', () => {
  it('hoyUTC devuelve YYYY-MM-DD', () => {
    expect(hoyUTC(new Date('2026-10-09T13:40:00.000Z'))).toBe('2026-10-09')
  })

  it('sparklinePath vacío con menos de 2 puntos', () => {
    expect(sparklinePath([], 100, 40)).toBe('')
    expect(sparklinePath([10], 100, 40)).toBe('')
  })

  it('sparklinePath traza un path con M inicial y una L por punto restante', () => {
    const p = sparklinePath([10, 20, 15], 100, 40)
    expect(p.startsWith('M')).toBe(true)
    expect((p.match(/L/g) ?? []).length).toBe(2)
  })
})
