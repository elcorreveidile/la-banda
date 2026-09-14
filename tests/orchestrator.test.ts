import { describe, expect, it } from 'vitest'
import { toyDomain } from '@domains/toy/config'
import { validateDomain, type AgentConfig, type AgentDecision } from '@domains/types'
import { createEngine } from '@/engine/orchestrator'
import type { AgentInput } from '@/engine/runAgent'
import { parseDecision } from '@/engine/decision'
import { createMemoryStore } from './memoryStore'

/** Agentes de guion: cada codename devuelve sus decisiones en orden. */
function scripted(script: Record<string, AgentDecision[]>) {
  const calls: { codename: string; input: AgentInput }[] = []
  const run = async (agent: AgentConfig, input: AgentInput) => {
    calls.push({ codename: agent.codename, input })
    const next = script[agent.codename]?.shift()
    if (!next) throw new Error(`sin guion para ${agent.codename}`)
    return next
  }
  return { run, calls }
}

async function play(script: Record<string, AgentDecision[]>) {
  const mem = createMemoryStore()
  const { run, calls } = scripted(script)
  const engine = createEngine(mem.store, run)
  const { session } = await engine.openSession(toyDomain, { kind: 'propuesta', payload: { tema: 'probar el motor' }, createdBy: 'test' })
  const final = await engine.runSession(toyDomain, session.id)
  return { ...mem, calls, final, types: mem.events.map((e) => e.type) }
}

describe('dominio toy', () => {
  it('es coherente', () => {
    expect(() => validateDomain(toyDomain)).not.toThrow()
  })
})

describe('orquestador', () => {
  it('camino feliz: Tokio pasa, Palermo cierra', async () => {
    const r = await play({
      Tokio: [{ action: 'pass', to: 'Palermo', payload: { pasos: ['a', 'b', 'c'] } }],
      Palermo: [{ action: 'close', payload: { veredicto: 'aprobado' } }],
    })
    expect(r.final.status).toBe('closed')
    expect(r.final.finalReport).toEqual({ veredicto: 'aprobado' })
    expect(r.handoffs.map((h) => h.status)).toEqual(['accepted', 'accepted'])
    expect(r.handoffs[1]).toMatchObject({ fromAgent: 'toy:Tokio', toAgent: 'toy:Palermo', payload: { pasos: ['a', 'b', 'c'] } })
    expect([...r.tasks.values()][0].status).toBe('done')
    expect(r.types).toEqual(['session_opened', 'handoff_created', 'agent_started', 'pass', 'agent_started', 'close'])
    // firma: cada acción de agente lleva su agentId
    expect(r.events.filter((e) => e.type === 'pass')[0].agentId).toBe('toy:Tokio')
    expect(r.events.filter((e) => e.type === 'close')[0].agentId).toBe('toy:Palermo')
  })

  it('Palermo devuelve a Tokio con motivo y Tokio vuelve a pasar', async () => {
    const r = await play({
      Tokio: [
        { action: 'pass', to: 'Palermo', payload: { v: 1 } },
        { action: 'pass', to: 'Palermo', payload: { v: 2 } },
      ],
      Palermo: [
        { action: 'return', to: 'Tokio', payload: { v: 1 }, reason: 'falta el riesgo' },
        { action: 'close', payload: { ok: true } },
      ],
    })
    expect(r.final.status).toBe('closed')
    expect(r.handoffs.map((h) => h.status)).toEqual(['accepted', 'returned', 'accepted', 'accepted'])
    expect(r.handoffs[1].reason).toBe('falta el riesgo')
    // Tokio recibe el motivo en su segunda invocación
    expect(r.calls[2].input.handoff.reason).toBe('falta el riesgo')
    expect(r.calls[2].input.handoff.from).toBe('Palermo')
    expect(r.types).toContain('return')
  })

  it('el veto cierra la sesión como vetada', async () => {
    const r = await play({
      Tokio: [{ action: 'pass', to: 'Palermo', payload: {} }],
      Palermo: [{ action: 'veto', payload: null, reason: 'sin marcha atrás' }],
    })
    expect(r.final.status).toBe('vetoed')
    expect(r.final.finalReport).toMatchObject({ vetoedBy: 'Palermo', reason: 'sin marcha atrás' })
    expect(r.handoffs[1].status).toBe('vetoed')
    expect([...r.tasks.values()][0].status).toBe('vetoed')
  })

  it('rechaza un traspaso fuera del grafo y lo registra', async () => {
    const r = await play({ Tokio: [{ action: 'pass', to: 'Tokio', payload: {} }] })
    expect(r.final.status).toBe('failed')
    expect(r.types).toContain('transition_rejected')
    expect(r.events.find((e) => e.type === 'transition_rejected')?.message).toMatch(/no está en el grafo/)
    expect(r.handoffs).toHaveLength(1)
  })

  it('rechaza un veto de quien no tiene veto', async () => {
    const r = await play({ Tokio: [{ action: 'veto', payload: {}, reason: 'no me gusta' }] })
    expect(r.final.status).toBe('failed')
    expect(r.events.find((e) => e.type === 'transition_rejected')?.message).toMatch(/no tiene veto/)
  })

  it('rechaza un cierre de quien no cierra', async () => {
    const r = await play({ Tokio: [{ action: 'close', payload: {} }] })
    expect(r.final.status).toBe('failed')
    expect(r.events.find((e) => e.type === 'transition_rejected')?.message).toMatch(/no puede cerrar/)
  })

  it('corta los bucles de devolución al superar maxSteps', async () => {
    const many = (d: AgentDecision) => Array.from({ length: 20 }, () => ({ ...d }))
    const r = await play({
      Tokio: many({ action: 'pass', to: 'Palermo', payload: {} }),
      Palermo: many({ action: 'return', to: 'Tokio', payload: {}, reason: 'otra vez' }),
    })
    expect(r.final.status).toBe('failed')
    expect(r.types).toContain('session_failed')
    expect(r.handoffs.length).toBeLessThanOrEqual(toyDomain.maxSteps + 1)
  })

  it('un error del agente detiene la sesión sin tirar el motor', async () => {
    const r = await play({ Tokio: [] })
    expect(r.final.status).toBe('failed')
    expect(r.types).toContain('agent_error')
  })

  it('entrega a cada agente solo sus herramientas y sus acciones permitidas', async () => {
    const r = await play({
      Tokio: [{ action: 'pass', to: 'Palermo', payload: {} }],
      Palermo: [{ action: 'close', payload: {} }],
    })
    const tokio = r.calls[0].input
    expect(tokio.tools.map((t) => t.name)).toEqual(['now'])
    expect(tokio.allowed).toEqual({ pass: ['Palermo'], return: [], veto: false, close: false })
    const palermo = r.calls[1].input
    expect(palermo.tools).toEqual([])
    expect(palermo.allowed).toEqual({ pass: [], return: ['Tokio'], veto: true, close: true })
  })

  it('no vuelve a tocar una sesión ya cerrada', async () => {
    const mem = createMemoryStore()
    const engine = createEngine(mem.store, async () => ({ action: 'close', payload: {} }))
    const { session } = await engine.openSession(toyDomain, { kind: 'propuesta', payload: {}, createdBy: 'test' })
    await mem.store.closeSession(session.id, 'closed')
    const s = await engine.runSession(toyDomain, session.id)
    expect(s.status).toBe('closed')
    expect(mem.handoffs[0].status).toBe('pending')
  })
})

describe('parseDecision', () => {
  it('exige destinatario en pass/return y motivo en return/veto', () => {
    expect(parseDecision({ action: 'pass', payload: {} })).toMatchObject({ ok: false })
    expect(parseDecision({ action: 'return', to: 'Tokio', payload: {} })).toMatchObject({ ok: false })
    expect(parseDecision({ action: 'veto', payload: {} })).toMatchObject({ ok: false })
    expect(parseDecision({ action: 'close', payload: { x: 1 } })).toEqual({ ok: true, decision: { action: 'close', to: undefined, payload: { x: 1 }, reason: undefined } })
  })
  it('rechaza acciones desconocidas', () => {
    expect(parseDecision({ action: 'execute', payload: {} }).ok).toBe(false)
  })
})

describe('fusión del dossier (el motor conserva lo anterior)', () => {
  it('pass con payload parcial: el siguiente agente recibe la unión y lo devuelto manda', async () => {
    const r = await play({
      Tokio: [{ action: 'pass', to: 'Palermo', payload: { propuesta: 'x', tema: 'cambiado' } }],
      Palermo: [{ action: 'close', payload: { veredicto: 'ok' } }],
    })
    const palermo = r.calls.find((c) => c.codename === 'Palermo')!
    expect(palermo.input.handoff.payload).toEqual({ tema: 'cambiado', propuesta: 'x' })
    // close no funde: el informe final es exactamente lo que devolvió el Profesor/Palermo
    expect(r.final.finalReport).toEqual({ veredicto: 'ok' })
  })

  it('la fusión es profunda: un campo anidado bajo otro ajeno no borra sus hermanos', async () => {
    const r = await play({
      Tokio: [{ action: 'pass', to: 'Palermo', payload: { borrador: { texto: 'el diálogo', titulo: 'Piso' }, lista: [1, 2] } }],
      Palermo: [
        { action: 'return', to: 'Tokio', payload: { borrador: { anotacionesBerlin: [{ codigo: 'x' }] }, lista: [3] }, reason: 'anota' },
        { action: 'close', payload: {} },
      ],
    })
    const tokio2 = r.calls.filter((c) => c.codename === 'Tokio')[1]
    // Muestra B2 «piso»: Berlín devolvió { borrador: { anotacionesBerlin } } y el texto de Río desaparecía.
    expect(tokio2.input.handoff.payload).toEqual({ tema: 'probar el motor', borrador: { texto: 'el diálogo', titulo: 'Piso', anotacionesBerlin: [{ codigo: 'x' }] }, lista: [3] })
  })

  it('return también funde, y un payload no-objeto sustituye', async () => {
    const r = await play({
      Tokio: [
        { action: 'pass', to: 'Palermo', payload: { propuesta: 'v1' } },
        { action: 'pass', to: 'Palermo', payload: 'texto suelto' },
      ],
      Palermo: [
        { action: 'return', to: 'Tokio', payload: { objecion: 'falta detalle' }, reason: 'corto' },
        { action: 'close', payload: {} },
      ],
    })
    const tokio2 = r.calls.filter((c) => c.codename === 'Tokio')[1]
    expect(tokio2.input.handoff.payload).toEqual({ tema: 'probar el motor', propuesta: 'v1', objecion: 'falta detalle' })
    const palermo2 = r.calls.filter((c) => c.codename === 'Palermo')[1]
    expect(palermo2.input.handoff.payload).toBe('texto suelto')
  })
})

describe('bloqueo de traspasos y reintento de agente', () => {
  it('dos step concurrentes sobre la misma sesión: solo uno procesa, el otro se salta', async () => {
    const mem = createMemoryStore()
    let llamadas = 0
    const engine = createEngine(mem.store, async (agent) => {
      llamadas++
      await new Promise((r) => setTimeout(r, 20))
      return agent.codename === 'Tokio' ? { action: 'pass', to: 'Palermo', payload: {} } : { action: 'close', payload: {} }
    })
    const { session } = await engine.openSession(toyDomain, { kind: 'propuesta', payload: {}, createdBy: 't' })
    const [a, b] = await Promise.all([engine.step(toyDomain, session.id), engine.step(toyDomain, session.id)])
    expect([a.skipped, b.skipped].filter(Boolean)).toHaveLength(1)
    expect(llamadas).toBe(1)
    // el traspaso procesado quedó aceptado y el siguiente pendiente (nadie lo encadena)
    expect(mem.handoffs.map((h) => h.status)).toEqual(['accepted', 'pending'])
    expect(await engine.hasPending(session.id)).toBe(true)
    expect(await engine.hasInProgress(session.id)).toBe(false)
  })

  it('un agente que falla deja el traspaso pendiente con un intento; al segundo fallo la sesión cae', async () => {
    const mem = createMemoryStore()
    let veces = 0
    const engine = createEngine(mem.store, async () => {
      veces++
      throw new Error('Request timed out.')
    })
    const { session } = await engine.openSession(toyDomain, { kind: 'propuesta', payload: {}, createdBy: 't' })
    const r1 = await engine.step(toyDomain, session.id)
    expect(r1.done).toBe(false)
    expect(mem.handoffs[0]).toMatchObject({ status: 'pending', intentos: 1, claimedAt: null })
    expect(mem.events.filter((e) => e.type === 'agent_error')).toHaveLength(1)
    expect(mem.events.some((e) => e.type === 'session_failed')).toBe(false)
    const r2 = await engine.step(toyDomain, session.id)
    expect(r2.done).toBe(true)
    expect(r2.session.status).toBe('failed')
    expect(veces).toBe(2)
  })

  it('releaseStale devuelve a pendiente los in_progress viejos y falla los que agotan intentos', async () => {
    const mem = createMemoryStore()
    const engine = createEngine(mem.store, async () => ({ action: 'close', payload: {} }))
    const { session, handoff } = await engine.openSession(toyDomain, { kind: 'propuesta', payload: {}, createdBy: 't' })
    const now = Date.now()
    expect(await mem.store.claimHandoff(handoff.id, new Date(now - 10 * 60_000))).toBe(true)
    const r = await engine.releaseStale(toyDomain, 7 * 60_000, now)
    expect(r).toEqual({ released: [session.id], failed: [] })
    expect(mem.handoffs[0]).toMatchObject({ status: 'pending', intentos: 1 })
    // otra vez colgado → intentos agotados → sesión fallida
    await mem.store.claimHandoff(handoff.id, new Date(now - 10 * 60_000))
    const r2 = await engine.releaseStale(toyDomain, 7 * 60_000, now)
    expect(r2).toEqual({ released: [], failed: [session.id] })
    expect(mem.sessions.get(session.id)!.status).toBe('failed')
    // uno reciente no se toca
    const { handoff: h2 } = await engine.openSession(toyDomain, { kind: 'propuesta', payload: {}, createdBy: 't' })
    await mem.store.claimHandoff(h2.id, new Date(now - 60_000))
    expect(await engine.releaseStale(toyDomain, 7 * 60_000, now)).toEqual({ released: [], failed: [] })
  })
})
