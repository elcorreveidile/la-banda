import { describe, expect, it } from 'vitest'
import { toyDomain } from '@domains/toy/config'
import type { AgentConfig } from '@domains/types'
import { createEngine } from '@/engine/orchestrator'
import { createMemoryStore } from './memoryStore'

const guion = async (agent: AgentConfig) => (agent.codename === 'Tokio' ? { action: 'pass' as const, to: 'Palermo', payload: {} } : { action: 'close' as const, payload: {} })

describe('purga de la traza', () => {
  it('borra solo las sesiones cerradas y antiguas, con sus tareas, traspasos y eventos', async () => {
    const mem = createMemoryStore()
    const engine = createEngine(mem.store, guion)
    const abrir = () => engine.openSession(toyDomain, { kind: 'propuesta', payload: {}, createdBy: 't' })
    const vieja = (await abrir()).session
    const reciente = (await abrir()).session
    const abierta = (await abrir()).session
    await engine.runSession(toyDomain, vieja.id)
    await engine.runSession(toyDomain, reciente.id)
    const now = Date.now()
    mem.sessions.get(vieja.id)!.closedAt = new Date(now - 40 * 24 * 3_600_000)
    mem.sessions.get(reciente.id)!.closedAt = new Date(now - 2 * 24 * 3_600_000)
    // la abierta, aunque sea antigua, no se purga (la recoge recoverOpen)
    mem.sessions.get(abierta.id)!.startedAt = new Date(now - 90 * 24 * 3_600_000)

    const borradas = await engine.purgeClosed(toyDomain, 30 * 24 * 3_600_000, now)
    expect(borradas).toEqual([vieja.id])
    expect(mem.sessions.has(vieja.id)).toBe(false)
    expect(mem.sessions.has(reciente.id)).toBe(true)
    expect(mem.sessions.has(abierta.id)).toBe(true)
    expect([...mem.tasks.values()].some((t) => t.sessionId === vieja.id)).toBe(false)
    expect(mem.events.some((e) => e.sessionId === vieja.id)).toBe(false)
    const tareasVivas = new Set([...mem.tasks.values()].map((t) => t.id))
    expect(mem.handoffs.every((h) => tareasVivas.has(h.taskId))).toBe(true)
  })

  it('no purga otros dominios', async () => {
    const mem = createMemoryStore()
    const engine = createEngine(mem.store, guion)
    const { session } = await engine.openSession(toyDomain, { kind: 'propuesta', payload: {}, createdBy: 't' })
    await engine.runSession(toyDomain, session.id)
    mem.sessions.get(session.id)!.closedAt = new Date(0)
    expect(await engine.purgeClosed({ ...toyDomain, name: 'otro' }, 1, Date.now())).toEqual([])
    expect(mem.sessions.has(session.id)).toBe(true)
  })
})
