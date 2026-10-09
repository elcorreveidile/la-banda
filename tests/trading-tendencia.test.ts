import { describe, expect, it } from 'vitest'
import { calcTendencia } from '@/lib/trading/tendencia'

/** Serie de `n` cierres que crece un `step` por día desde `start`. */
function serie(n: number, start: number, step: number): number[] {
  return Array.from({ length: n }, (_, i) => start + i * step)
}

describe('calcTendencia', () => {
  it('serie vacía o sin cierres válidos → null', () => {
    expect(calcTendencia([])).toBeNull()
    expect(calcTendencia([0, -1, NaN])).toBeNull()
  })

  it('mide la variación por ventanas (7/30/90 días)', () => {
    const closes = serie(120, 100, 1) // +1/día, último = 219
    const t = calcTendencia(closes)!
    expect(t.precio).toBe(219)
    // hace 7 días el cierre era 212 → 219/212 - 1
    expect(t.cambio7).toBeCloseTo(219 / 212 - 1, 6)
    expect(t.cambio30).toBeCloseTo(219 / 189 - 1, 6)
    expect(t.cambio90).toBeCloseTo(219 / 129 - 1, 6)
  })

  it('ventana sin datos suficientes → null (p. ej. 90 d con 60 velas)', () => {
    const t = calcTendencia(serie(60, 100, 1))!
    expect(t.cambio90).toBeNull()
    expect(t.sma200).toBeNull()
    expect(t.sma50).not.toBeNull()
  })

  it('tendencia alcista: precio sobre medias, medias ordenadas', () => {
    const t = calcTendencia(serie(260, 100, 1))!
    expect(t.sma200).not.toBeNull()
    expect(t.precio).toBeGreaterThan(t.sma50!)
    expect(t.sma50!).toBeGreaterThan(t.sma200!)
    expect(t.direccion).toBe('alcista')
  })

  it('tendencia bajista: precio bajo las medias', () => {
    const t = calcTendencia(serie(260, 400, -1))! // decreciente
    expect(t.precio).toBeLessThan(t.sma50!)
    expect(t.sma50!).toBeLessThan(t.sma200!)
    expect(t.direccion).toBe('bajista')
  })

  it('tendencia lateral: oscila en torno a un valor', () => {
    const closes = Array.from({ length: 260 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1))
    const t = calcTendencia(closes)!
    expect(t.direccion).toBe('lateral')
  })
})
