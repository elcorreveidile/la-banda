import { describe, expect, it } from 'vitest'
import { componerResumenTrading, parseRecomendaciones, recomendacionesDe, type Recomendacion } from '@/lib/trading/recomendaciones'

describe('parseRecomendaciones', () => {
  it('sanea símbolo, acción y confianza, y acota niveles/motivo', () => {
    const recs = parseRecomendaciones([
      { symbol: 'btc-usd', accion: 'comprar', confianza: 'alta', entrada: 60000, stop: 58000, objetivo: 65000, horizonte: '2-3 días', motivo: '  ruptura con volumen  ' },
    ])
    expect(recs).toHaveLength(1)
    expect(recs[0]).toMatchObject({ symbol: 'BTC-USD', accion: 'comprar', confianza: 'alta', entrada: 60000, stop: 58000, objetivo: 65000, horizonte: '2-3 días', motivo: 'ruptura con volumen' })
  })

  it('cae a fuera/baja ante acción o confianza inválidas y descarta niveles no positivos', () => {
    const [r] = parseRecomendaciones([{ symbol: 'ETH-USD', accion: 'HODL', confianza: 'altísima', entrada: 0, stop: -5, objetivo: 'x', motivo: 'ruido' }])
    expect(r.accion).toBe('fuera')
    expect(r.confianza).toBe('baja')
    expect(r).toMatchObject({ entrada: null, stop: null, objetivo: null, horizonte: null })
  })

  it('descarta símbolos desconocidos y deduplica por símbolo (se queda la primera)', () => {
    const recs = parseRecomendaciones([
      { symbol: 'DOGE-USD', accion: 'comprar', motivo: 'no cubierto' },
      { symbol: 'BTC-USD', accion: 'comprar', confianza: 'media', motivo: 'primera' },
      { symbol: 'BTC-USD', accion: 'vender', confianza: 'alta', motivo: 'segunda' },
    ])
    expect(recs.map((r) => r.symbol)).toEqual(['BTC-USD'])
    expect(recs[0].motivo).toBe('primera')
  })

  it('devuelve [] si no es un array', () => {
    expect(parseRecomendaciones(undefined)).toEqual([])
    expect(parseRecomendaciones({ symbol: 'BTC-USD' })).toEqual([])
  })
})

describe('recomendacionesDe', () => {
  it('lee el campo del informe plano', () => {
    const recs = recomendacionesDe({ resultado: 'sin_operacion', recomendaciones: [{ symbol: 'BTC-USD', accion: 'mantener', confianza: 'media', motivo: 'lateral' }] })
    expect(recs).toEqual([{ symbol: 'BTC-USD', accion: 'mantener', confianza: 'media', entrada: null, stop: null, objetivo: null, horizonte: null, motivo: 'lateral' }])
  })

  it('lee el campo aunque venga anidado en `informe`', () => {
    const recs = recomendacionesDe({ informe: { recomendaciones: [{ symbol: 'ETH-USD', accion: 'fuera', confianza: 'baja', motivo: 'sin setup' }] } })
    expect(recs.map((r) => r.symbol)).toEqual(['ETH-USD'])
  })

  it('devuelve [] sin informe o sin campo', () => {
    expect(recomendacionesDe(null)).toEqual([])
    expect(recomendacionesDe({ resultado: 'sin_operacion' })).toEqual([])
  })
})

describe('componerResumenTrading', () => {
  const recs: Recomendacion[] = [
    { symbol: 'BTC-USD', accion: 'comprar', confianza: 'alta', entrada: 60000, stop: 58000, objetivo: 65000, horizonte: '2-3 días', motivo: 'ruptura con volumen' },
    { symbol: 'ETH-USD', accion: 'fuera', confianza: 'baja', entrada: null, stop: null, objetivo: null, horizonte: null, motivo: 'sin configuración' },
  ]

  it('devuelve null sin recomendaciones (no envía correos vacíos)', () => {
    expect(componerResumenTrading({ ciclo: null, recomendaciones: [] })).toBeNull()
  })

  it('compone asunto, texto y html con las recomendaciones, la cartera y el aviso', () => {
    const correo = componerResumenTrading({ ciclo: '2026-10-09T07:00:00.000Z', recomendaciones: recs, cartera: { equityUsd: 101.5, cashUsd: 50, initialUsd: 100 } })
    expect(correo).not.toBeNull()
    expect(correo!.asunto).toMatch(/^Recomendaciones de la mesa — /)
    expect(correo!.texto).toContain('BTC-USD: COMPRAR (confianza alta)')
    expect(correo!.texto).toContain('ETH-USD: FUERA / ESPERAR')
    expect(correo!.texto).toContain('Cartera simulada')
    expect(correo!.texto).toContain('no es asesoramiento financiero')
    expect(correo!.html).toContain('BTC-USD')
    expect(correo!.html).toContain('COMPRAR')
  })
})
