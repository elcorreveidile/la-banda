import { describe, expect, it } from 'vitest'
import { olvidosDomain } from '@domains/olvidos/config'
import { validateDomain } from '@domains/types'
import { SECCIONES, countLines, countWords, getSection, measureAgainstSection } from '@domains/olvidos/secciones'
import { HOJA_DE_ESTILO } from '@domains/olvidos/hojaDeEstilo'
import { createEngine } from '@/engine/orchestrator'
import { createMemoryStore } from './memoryStore'

const CHAIN = ['Tokio', 'Denver', 'Berlín', 'Río', 'Lisboa', 'Estocolmo', 'Nairobi', 'Palermo', 'Helsinki', 'Profesor']

describe('dominio olvidos', () => {
  it('es coherente y sigue el grafo del brief §6', () => {
    expect(() => validateDomain(olvidosDomain)).not.toThrow()
    expect(olvidosDomain.agents.map((a) => a.codename)).toEqual(CHAIN)
    for (let i = 0; i < CHAIN.length - 1; i++) expect(olvidosDomain.transitions[CHAIN[i]]).toEqual([CHAIN[i + 1]])
    expect(olvidosDomain.returns).toEqual({ Lisboa: ['Tokio', 'Denver', 'Berlín', 'Río'] })
    expect(olvidosDomain.agents.filter((a) => a.canVeto).map((a) => a.codename)).toEqual(['Palermo'])
    expect(olvidosDomain.closer).toBe('Profesor')
  })

  it('cada agente tiene solo las herramientas del brief', () => {
    expect(Object.fromEntries(olvidosDomain.agents.map((a) => [a.codename, a.tools]))).toEqual({
      Tokio: ['readManuscript'],
      Denver: ['readManuscript'],
      Berlín: ['readStyleSheet'],
      Río: ['readManuscript'],
      Lisboa: ['readManuscript', 'webSearch'],
      Estocolmo: ['readManuscript', 'getSectionLimits'],
      Nairobi: [],
      Palermo: [],
      Helsinki: ['writeLedger'],
      Profesor: ['readAll'],
    })
  })

  it('los prompts prohíben reescribir', () => {
    for (const a of olvidosDomain.agents) expect(a.systemPrompt).toMatch(/SEÑALAR, NO CORREGIR/)
    expect(HOJA_DE_ESTILO).toMatch(/No reescribe/)
  })

  it('Lisboa devuelve a Denver y la cadena sigue hasta el Profesor', async () => {
    const mem = createMemoryStore()
    let lisboaCalls = 0
    const engine = createEngine(mem.store, async (agent, input) => {
      const i = CHAIN.indexOf(agent.codename)
      if (agent.codename === 'Lisboa' && lisboaCalls++ === 0) return { action: 'return', to: 'Denver', payload: input.handoff.payload, reason: 'Denver cita [¶40] y el texto tiene 12 párrafos' }
      if (agent.codename === 'Profesor') return { action: 'close', payload: { veredicto: 'con_cambios' } }
      return { action: 'pass', to: CHAIN[i + 1], payload: input.handoff.payload }
    })
    const { session } = await engine.openSession(olvidosDomain, { kind: 'manuscrito', payload: { manuscriptId: 'm1', versionId: 'v1' }, createdBy: 'test' })
    const s = await engine.runSession(olvidosDomain, session.id)
    expect(s.status).toBe('closed')
    expect(s.finalReport).toEqual({ veredicto: 'con_cambios' })
    expect(mem.events.filter((e) => e.type === 'return')).toHaveLength(1)
    // Denver, Berlín, Río y Lisboa se repiten tras la devolución: 10 + 4 traspasos
    expect(mem.handoffs).toHaveLength(14)
  })
})

describe('secciones', () => {
  it('cuenta palabras y versos', () => {
    expect(countWords('# Título\n\nHola, mundo. *Cursiva* y «comillas».')).toBe(6)
    expect(countLines('# Soneto\n\nverso uno\nverso dos\n\nverso tres')).toBe(3)
  })

  it('mide contra la sección', () => {
    const corto = measureAgainstSection('palabra '.repeat(100), 'editorial')
    expect(corto).toMatchObject({ fits: false })
    expect('note' in corto && corto.note).toMatch(/faltan 250 palabras/)
    const bien = measureAgainstSection('palabra '.repeat(500), 'editorial')
    expect(bien).toMatchObject({ fits: true, words: 500 })
    const soneto = measureAgainstSection(Array.from({ length: 14 }, (_, i) => `verso ${i + 1}`).join('\n'), 'soneto500')
    expect(soneto).toMatchObject({ fits: true, lines: 14 })
    expect(measureAgainstSection('x', 'inexistente')).toEqual({ error: 'sección desconocida: inexistente' })
  })

  it('todas las secciones tienen clave única y algún límite', () => {
    expect(new Set(SECCIONES.map((s) => s.key)).size).toBe(SECCIONES.length)
    for (const s of SECCIONES) expect(s.maxWords != null || s.maxLines != null).toBe(true)
    expect(getSection('soneto500')?.maxLines).toBe(14)
  })
})
