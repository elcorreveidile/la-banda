import { describe, expect, it } from 'vitest'
import { normalizarPayload, parseDecision } from '@/engine/decision'
import { fundirPayload } from '@/engine/orchestrator'

describe('payload que llega como texto', () => {
  it('un JSON en texto se convierte en objeto y se funde con el dossier', () => {
    const r = parseDecision({ action: 'pass', to: 'Palermo', payload: '{ "articuloEn": { "titulo": "Hi", "html": "<p>a</p>" } }' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.decision.payload).toEqual({ articuloEn: { titulo: 'Hi', html: '<p>a</p>' } })
    expect(fundirPayload({ articuloEs: { titulo: 'Hola' } }, r.decision.payload)).toEqual({ articuloEs: { titulo: 'Hola' }, articuloEn: { titulo: 'Hi', html: '<p>a</p>' } })
  })

  it('repara saltos de línea en crudo dentro de las cadenas', () => {
    expect(normalizarPayload('{"articuloEn":{"html":"<p>a</p>\n<p>b</p>"}}')).toEqual({ articuloEn: { html: '<p>a</p>\n<p>b</p>' } })
  })

  it('un JSON ilegible se rechaza para que el agente reintente', () => {
    const r = parseDecision({ action: 'pass', to: 'Palermo', payload: '{"articuloEn": {"titulo": "sin cerrar"' })
    expect(r.ok).toBe(false)
  })

  it('texto normal y objetos no cambian', () => {
    expect(normalizarPayload('Aprobado')).toBe('Aprobado')
    expect(normalizarPayload({ a: 1 })).toEqual({ a: 1 })
  })
})
