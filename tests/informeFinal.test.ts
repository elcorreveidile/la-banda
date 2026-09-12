import { describe, expect, it } from 'vitest'
import { informeFinal } from '@/lib/trading/informe'

describe('informe final del Profesor', () => {
  it('extrae el informe anidado (sesión 1) sin perder los campos de arriba', () => {
    const r = informeFinal({ ciclo: 'x', setup: null, informe: { resultado: 'sin_operacion', resumen: 'R', mejora: 'M', devoluciones: 0 } }) as Record<string, unknown>
    expect(r.resultado).toBe('sin_operacion')
    expect(r.resumen).toBe('R')
    expect(r.ciclo).toBe('x')
    expect(r.informe).toBeUndefined()
  })
  it('respeta los campos de arriba cuando informe solo trae fecha y firma (sesión 2)', () => {
    const r = informeFinal({ resultado: 'sin_operacion', resumen: 'R2', informe: { fecha: 'f', cerradoPor: 'Profesor' } }) as Record<string, unknown>
    expect(r.resultado).toBe('sin_operacion')
    expect(r.resumen).toBe('R2')
    expect(r.cerradoPor).toBe('Profesor')
  })
  it('deja pasar informes planos y nulos', () => {
    expect(informeFinal(null)).toBeNull()
    expect(informeFinal({ resultado: 'orden_ejecutada' })).toEqual({ resultado: 'orden_ejecutada' })
  })
})
