import { afterEach, describe, expect, it } from 'vitest'
import { toyDomain } from '@domains/toy/config'
import type { AgentConfig } from '@domains/types'
import { createEngine } from '@/engine/orchestrator'
import { selfOrigin } from '@/engine/tick'
import { createMemoryStore } from './memoryStore'

/** Tokio pasa a Palermo y Palermo cierra (el grafo del dominio toy). */
const guion = async (agent: AgentConfig) => (agent.codename === 'Tokio' ? { action: 'pass' as const, to: 'Palermo', payload: {} } : { action: 'close' as const, payload: {} })

describe('recuperación de sesiones abiertas', () => {
  it('abandona las antiguas y devuelve las recientes para relanzar', async () => {
    const mem = createMemoryStore()
    const engine = createEngine(mem.store, guion)
    const vieja = (await engine.openSession(toyDomain, { kind: 'propuesta', payload: {}, createdBy: 't' })).session
    const reciente = (await engine.openSession(toyDomain, { kind: 'propuesta', payload: {}, createdBy: 't' })).session
    const now = reciente.startedAt.getTime() + 60_000
    mem.sessions.get(vieja.id)!.startedAt = new Date(now - 3 * 3_600_000)
    const r = await engine.recoverOpen(toyDomain, 90 * 60_000, now)
    expect(r.abandoned).toEqual([vieja.id])
    expect(r.resume).toEqual([reciente.id])
    expect(mem.sessions.get(vieja.id)!.status).toBe('failed')
    expect(mem.handoffs.find((h) => h.taskId && mem.tasks.get(h.taskId)!.sessionId === vieja.id)!.status).toBe('vetoed')
    expect(mem.events.some((e) => e.sessionId === vieja.id && e.type === 'session_failed')).toBe(true)
    // la reciente sigue abierta y se puede continuar
    const s = await engine.runSession(toyDomain, reciente.id)
    expect(s.status).toBe('closed')
  })

  it('abandonar una sesión ya cerrada no la toca', async () => {
    const mem = createMemoryStore()
    const engine = createEngine(mem.store, guion)
    const { session } = await engine.openSession(toyDomain, { kind: 'propuesta', payload: {}, createdBy: 't' })
    await engine.runSession(toyDomain, session.id)
    const s = await engine.abandonSession(toyDomain, session.id, 'x')
    expect(s.status).toBe('closed')
  })
})

describe('origen para los ticks', () => {
  const prev = { ...process.env }
  afterEach(() => {
    for (const k of ['APP_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_ENV']) {
      if (prev[k] === undefined) delete process.env[k]
      else process.env[k] = prev[k]
    }
  })
  it('APP_URL manda; si no, el dominio de producción de Vercel; si no, la petición', () => {
    delete process.env.APP_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    delete process.env.VERCEL_ENV
    expect(selfOrigin('https://la-banda-abc123-team.vercel.app/api/cron/trading')).toBe('https://la-banda-abc123-team.vercel.app')
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'la-banda-drab.vercel.app'
    process.env.VERCEL_ENV = 'production'
    expect(selfOrigin('https://la-banda-abc123-team.vercel.app/x')).toBe('https://la-banda-drab.vercel.app')
    process.env.VERCEL_ENV = 'preview'
    expect(selfOrigin('https://preview.vercel.app/x')).toBe('https://preview.vercel.app')
    process.env.APP_URL = 'https://mesa.example/'
    expect(selfOrigin('https://otro/x')).toBe('https://mesa.example')
  })
})
