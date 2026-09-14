import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toyDomain } from '@domains/toy/config'

// La bomba usa el motor real de producción (`@/engine`) y `kickTick`: aquí se sustituyen por
// un motor en memoria y un kick que solo apunta lo que habría lanzado.
// vi.mock se eleva al principio del fichero: lo que use dentro tiene que venir de vi.hoisted.
const { mem, engineMem } = await vi.hoisted(async () => {
  const { createMemoryStore } = await import('./memoryStore')
  const { createEngine } = await import('@/engine/orchestrator')
  const m = createMemoryStore()
  const e = createEngine(m.store, async (agent) => (agent.codename === 'Tokio' ? { action: 'pass' as const, to: 'Palermo', payload: {} } : { action: 'close' as const, payload: {} }))
  return { mem: m, engineMem: e }
})
vi.mock('@/engine', () => ({ engine: engineMem }))
vi.mock('@/engine/tick', () => ({ kickTick: vi.fn() }))
import { kickTick } from '@/engine/tick'
import { bombear, staleSessionMs } from '@/lib/bomba'

/** El reloj de memoryStore es ficticio (2026-01-01 + segundos): «ahora» se toma de ahí. */
const ahora = () => new Date(2026, 0, 1, 0, 30, 0).getTime()

describe('bomba de ticks', () => {
  beforeEach(() => {
    vi.mocked(kickTick).mockReset().mockResolvedValue(undefined)
  })

  it('lanza un tick solo a las sesiones con pendiente y sin agente en curso', async () => {
    const now = ahora()
    const conPendiente = (await engineMem.openSession(toyDomain, { kind: 'propuesta', payload: {}, createdBy: 't' })).session
    const enCurso = await engineMem.openSession(toyDomain, { kind: 'propuesta', payload: {}, createdBy: 't' })
    await mem.store.claimHandoff(enCurso.handoff.id, new Date(now - 60_000))
    const cerrada = (await engineMem.openSession(toyDomain, { kind: 'propuesta', payload: {}, createdBy: 't' })).session
    await engineMem.runSession(toyDomain, cerrada.id)

    const r = await bombear('https://x.test', [toyDomain], now)
    expect(r.kicked).toEqual([`toy:${conPendiente.id}`])
    expect(r.enCurso).toEqual([`toy:${enCurso.session.id}`])
    expect(r.released).toEqual([])
    expect(kickTick).toHaveBeenCalledTimes(1)
    expect(kickTick).toHaveBeenCalledWith('https://x.test', 'toy', conPendiente.id)
  })

  it('libera un tick perdido y lo relanza en el mismo ciclo; abandona las sesiones caducadas', async () => {
    const now = ahora()
    const perdida = await engineMem.openSession(toyDomain, { kind: 'propuesta', payload: {}, createdBy: 't' })
    await mem.store.claimHandoff(perdida.handoff.id, new Date(now - 10 * 60_000))
    const vieja = (await engineMem.openSession(toyDomain, { kind: 'propuesta', payload: {}, createdBy: 't' })).session
    mem.sessions.get(vieja.id)!.startedAt = new Date(now - staleSessionMs('toy') - 60_000)

    const r = await bombear('https://x.test', [toyDomain], now)
    expect(r.released).toEqual([`toy:${perdida.session.id}`])
    expect(r.kicked).toContain(`toy:${perdida.session.id}`)
    expect(r.abandoned).toEqual([`toy:${vieja.id}`])
    expect(mem.sessions.get(vieja.id)!.status).toBe('failed')
  })

  it('un kick que falla no para la bomba', async () => {
    const s = (await engineMem.openSession(toyDomain, { kind: 'propuesta', payload: {}, createdBy: 't' })).session
    vi.mocked(kickTick).mockImplementation(async (_o, _d, id) => {
      if (id === s.id) throw new Error('tick 502')
    })
    const r = await bombear('https://x.test', [toyDomain], ahora())
    expect(r.fallidos[`toy:${s.id}`]).toBe('tick 502')
    // las demás sesiones abiertas (de tests anteriores) sí recibieron su tick
    expect(r.kicked.length).toBeGreaterThan(0)
  })

  it('caducidad por dominio', () => {
    expect(staleSessionMs('trading')).toBe(90 * 60_000)
    expect(staleSessionMs('corpus-ele')).toBe(6 * 60 * 60_000)
    expect(staleSessionMs('toy')).toBe(6 * 60 * 60_000)
  })
})
