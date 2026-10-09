import { describe, expect, it } from 'vitest'
import { evaluarReco, trackRecord, type RecoPasada } from '@/lib/trading/trackrecord'

describe('evaluarReco', () => {
  it('comprar: acierta si sube más que la banda, falla si cae, neutro dentro de banda', () => {
    expect(evaluarReco('comprar', 100, 110)).toBe('acierto')
    expect(evaluarReco('comprar', 100, 90)).toBe('fallo')
    expect(evaluarReco('comprar', 100, 101)).toBe('neutro') // +1 % < banda 2 %
  })

  it('vender/salir: acierta si cae, falla si sube, neutro dentro de banda', () => {
    expect(evaluarReco('vender', 100, 90)).toBe('acierto')
    expect(evaluarReco('vender', 100, 110)).toBe('fallo')
    expect(evaluarReco('vender', 100, 99)).toBe('neutro')
  })

  it('mantener: acierta si no cae más que la banda; falla si se desploma', () => {
    expect(evaluarReco('mantener', 100, 105)).toBe('acierto')
    expect(evaluarReco('mantener', 100, 99)).toBe('acierto') // -1 % aún dentro de banda
    expect(evaluarReco('mantener', 100, 90)).toBe('fallo')
  })

  it('fuera no se puntúa (neutro)', () => {
    expect(evaluarReco('fuera', 100, 200)).toBe('neutro')
    expect(evaluarReco('fuera', 100, 50)).toBe('neutro')
  })

  it('sin precio actual o precio de referencia inválido → neutro', () => {
    expect(evaluarReco('comprar', 100, null)).toBe('neutro')
    expect(evaluarReco('comprar', 0, 100)).toBe('neutro')
    expect(evaluarReco('comprar', -5, 100)).toBe('neutro')
  })

  it('la banda es configurable', () => {
    expect(evaluarReco('comprar', 100, 103, 0.05)).toBe('neutro') // +3 % < banda 5 %
    expect(evaluarReco('comprar', 100, 103, 0.02)).toBe('acierto')
  })
})

describe('trackRecord', () => {
  const hist: RecoPasada[] = [
    { symbol: 'BTC-USD', accion: 'comprar', precioRef: 100 }, // sube a 120 → acierto
    { symbol: 'ETH-USD', accion: 'comprar', precioRef: 100 }, // cae a 80 → fallo
    { symbol: 'DASH-USD', accion: 'mantener', precioRef: 100 }, // 100 → acierto
    { symbol: 'MON-USD', accion: 'fuera', precioRef: 100 }, // no se puntúa
    { symbol: 'XRP-USD', accion: 'vender', precioRef: 100 }, // sin precio → neutro
  ]
  const precios = { 'BTC-USD': 120, 'ETH-USD': 80, 'DASH-USD': 100, 'MON-USD': 50, 'XRP-USD': null }

  it('agrega aciertos/fallos por acción, ignora neutros y «fuera»', () => {
    const t = trackRecord(hist, precios)
    expect(t.evaluadas).toBe(3) // comprar×2 + mantener×1 (fuera y sin-precio fuera)
    expect(t.aciertos).toBe(2)
    expect(t.fallos).toBe(1)
    expect(t.pct).toBeCloseTo(2 / 3, 6)
    const comprar = t.porAccion.find((p) => p.accion === 'comprar')!
    expect(comprar).toMatchObject({ aciertos: 1, fallos: 1, pct: 0.5 })
    const mantener = t.porAccion.find((p) => p.accion === 'mantener')!
    expect(mantener).toMatchObject({ aciertos: 1, fallos: 0, pct: 1 })
    expect(t.porAccion.some((p) => p.accion === 'fuera')).toBe(false)
  })

  it('historial vacío → nada evaluado, pct null', () => {
    const t = trackRecord([], {})
    expect(t.evaluadas).toBe(0)
    expect(t.pct).toBeNull()
    expect(t.porAccion).toEqual([])
  })
})
