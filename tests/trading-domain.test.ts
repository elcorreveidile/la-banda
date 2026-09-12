import { describe, expect, it } from 'vitest'
import { tradingDomain } from '@domains/trading/config'
import { validateDomain } from '@domains/types'
import { createEngine } from '@/engine/orchestrator'
import { createMemoryStore } from './memoryStore'

const CHAIN = ['Tokio', 'Denver', 'Estocolmo', 'Río', 'Berlín', 'Lisboa', 'Nairobi', 'Palermo', 'Helsinki', 'Profesor']

describe('dominio trading', () => {
  it('es coherente y tiene los diez roles del brief', () => {
    expect(() => validateDomain(tradingDomain)).not.toThrow()
    expect(tradingDomain.agents.map((a) => a.codename)).toEqual(CHAIN)
    expect(tradingDomain.agents.filter((a) => a.canVeto).map((a) => a.codename)).toEqual(['Palermo'])
    expect(tradingDomain.closer).toBe('Profesor')
    expect(tradingDomain.entry).toBe('Tokio')
  })

  it('cada agente tiene solo las herramientas del brief', () => {
    const tools = Object.fromEntries(tradingDomain.agents.map((a) => [a.codename, a.tools]))
    expect(tools).toEqual({
      Tokio: ['getCandles'],
      Denver: ['getCandles', 'webSearch'],
      Estocolmo: ['getPortfolio'],
      Río: ['getCandles'],
      Berlín: [],
      Lisboa: ['getCandles', 'now'],
      Nairobi: [],
      Palermo: [],
      Helsinki: ['writeLedger'],
      Profesor: ['readAll'],
    })
  })

  it('la cadena hacia delante sigue el orden del brief y solo Lisboa devuelve', () => {
    for (let i = 0; i < CHAIN.length - 1; i++) expect(tradingDomain.transitions[CHAIN[i]]).toContain(CHAIN[i + 1])
    expect(tradingDomain.transitions.Profesor).toEqual([])
    expect(Object.keys(tradingDomain.returns)).toEqual(['Lisboa'])
    expect(tradingDomain.returns.Lisboa).toEqual(['Tokio', 'Denver', 'Estocolmo', 'Río', 'Berlín'])
  })

  it('el veto de Palermo o el cierre del Profesor por parte de otro se rechazan', async () => {
    const mem = createMemoryStore()
    const engine = createEngine(mem.store, async (agent) => (agent.codename === 'Tokio' ? { action: 'veto', payload: {}, reason: 'no' } : { action: 'close', payload: {} }))
    const { session } = await engine.openSession(tradingDomain, { kind: 'ciclo', payload: {}, createdBy: 'test' })
    const s = await engine.runSession(tradingDomain, session.id)
    expect(s.status).toBe('failed')
    expect(mem.events.some((e) => e.type === 'transition_rejected')).toBe(true)
  })

  it('recorre los diez pasos con step() como haría la cadena de ticks', async () => {
    const mem = createMemoryStore()
    const engine = createEngine(mem.store, async (agent, input) => {
      const i = CHAIN.indexOf(agent.codename)
      if (agent.codename === 'Profesor') return { action: 'close', payload: { resultado: 'orden_ejecutada', dossier: input.handoff.payload } }
      return { action: 'pass', to: CHAIN[i + 1], payload: { ...(input.handoff.payload as object), [agent.codename]: true } }
    })
    const { session } = await engine.openSession(tradingDomain, { kind: 'ciclo', payload: { ciclo: 'x' }, createdBy: 'test' })
    let ticks = 0
    for (;;) {
      ticks++
      const r = await engine.step(tradingDomain, session.id)
      if (r.done) break
    }
    expect(ticks).toBe(10)
    const final = mem.sessions.get(session.id)!
    expect(final.status).toBe('closed')
    expect((final.finalReport as { dossier: Record<string, boolean> }).dossier).toMatchObject({ Tokio: true, Helsinki: true })
    // un tick más no toca nada
    const extra = await engine.step(tradingDomain, session.id)
    expect(extra.done).toBe(true)
    expect(mem.handoffs).toHaveLength(10)
  })

  it('Tokio puede ir directo al Profesor cuando no hay configuración', async () => {
    const mem = createMemoryStore()
    const engine = createEngine(mem.store, async (agent) =>
      agent.codename === 'Tokio' ? { action: 'pass', to: 'Profesor', payload: { setup: null } } : { action: 'close', payload: { resultado: 'sin_operacion' } },
    )
    const { session } = await engine.openSession(tradingDomain, { kind: 'ciclo', payload: {}, createdBy: 'test' })
    const s = await engine.runSession(tradingDomain, session.id)
    expect(s.status).toBe('closed')
    expect(mem.handoffs).toHaveLength(2)
  })
})
