import { describe, expect, it } from 'vitest'
import { evaluarAlerta, leerEstado, ESTADO_VACIO } from '@/lib/trading/alertas'

const obs = (o: Partial<Parameters<typeof evaluarAlerta>[1]> = {}) => ({
  symbol: 'BTC-USD',
  accion: 'mantener' as const,
  precio: 100,
  stop: null,
  objetivo: null,
  cambio1: null,
  day: '2026-10-09',
  ...o,
})

describe('evaluarAlerta', () => {
  it('primera vez (estado vacío): no avisa de cambio, fija la línea base', () => {
    const { avisos, estado } = evaluarAlerta(ESTADO_VACIO, obs({ accion: 'comprar' }))
    expect(avisos).toEqual([])
    expect(estado.accion).toBe('comprar')
  })

  it('avisa cuando cambia la acción', () => {
    const prev = { ...ESTADO_VACIO, accion: 'mantener' as const }
    const { avisos } = evaluarAlerta(prev, obs({ accion: 'vender' }))
    expect(avisos.some((a) => /mantener a vender/.test(a))).toBe(true)
  })

  it('avisa al tocar el stop una sola vez (no repite)', () => {
    const base = { ...ESTADO_VACIO, accion: 'comprar' as const, stop: 90, objetivo: null }
    const r1 = evaluarAlerta(base, obs({ accion: 'comprar', stop: 90, precio: 89 }))
    expect(r1.avisos.some((a) => /stop/.test(a))).toBe(true)
    expect(r1.estado.stopAvisado).toBe(true)
    const r2 = evaluarAlerta(r1.estado, obs({ accion: 'comprar', stop: 90, precio: 88 }))
    expect(r2.avisos.some((a) => /stop/.test(a))).toBe(false)
  })

  it('rearma el aviso de stop si el nivel cambia', () => {
    const prev = { ...ESTADO_VACIO, accion: 'comprar' as const, stop: 90, stopAvisado: true }
    const r = evaluarAlerta(prev, obs({ accion: 'comprar', stop: 80, precio: 79 }))
    expect(r.avisos.some((a) => /stop/.test(a))).toBe(true)
  })

  it('avisa de movimiento fuerte una vez al día', () => {
    const r1 = evaluarAlerta(ESTADO_VACIO, obs({ cambio1: 0.09, day: '2026-10-09' }))
    expect(r1.avisos.some((a) => /movimiento fuerte/.test(a))).toBe(true)
    const r2 = evaluarAlerta(r1.estado, obs({ cambio1: 0.1, day: '2026-10-09' }))
    expect(r2.avisos.some((a) => /movimiento fuerte/.test(a))).toBe(false)
    const r3 = evaluarAlerta(r2.estado, obs({ cambio1: 0.1, day: '2026-10-10' }))
    expect(r3.avisos.some((a) => /movimiento fuerte/.test(a))).toBe(true)
  })

  it('leerEstado tolera basura y normaliza', () => {
    expect(leerEstado(null)).toEqual(ESTADO_VACIO)
    expect(leerEstado({ accion: 'xxx', stop: 'no', stopAvisado: 'sí' })).toEqual(ESTADO_VACIO)
    expect(leerEstado({ accion: 'vender', stop: 10, stopAvisado: true, bigMoveDay: '2026-10-09' })).toMatchObject({ accion: 'vender', stop: 10, stopAvisado: true, bigMoveDay: '2026-10-09' })
  })
})
