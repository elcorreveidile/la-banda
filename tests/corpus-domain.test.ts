import { describe, expect, it } from 'vitest'
import { corpusEleDomain, NIVELES } from '@domains/corpus-ele/config'
import { validateDomain } from '@domains/types'
import { createEngine } from '@/engine/orchestrator'
import { createMemoryStore } from './memoryStore'

const CHAIN = ['Tokio', 'Denver', 'Estocolmo', 'Río', 'Berlín', 'Lisboa', 'Nairobi', 'Palermo', 'Helsinki', 'Profesor']

describe('dominio corpus-ele', () => {
  it('es coherente y sigue un solo grafo lineal para las dos cadenas', () => {
    expect(() => validateDomain(corpusEleDomain)).not.toThrow()
    expect(corpusEleDomain.name).toBe('corpus-ele')
    expect(corpusEleDomain.agents.map((a) => a.codename)).toEqual(CHAIN)
    for (let i = 0; i < CHAIN.length - 1; i++) expect(corpusEleDomain.transitions[CHAIN[i]]).toEqual([CHAIN[i + 1]])
    expect(corpusEleDomain.transitions.Profesor).toEqual([])
    expect(corpusEleDomain.returns).toEqual({ Lisboa: ['Río', 'Berlín'] })
    expect(corpusEleDomain.agents.filter((a) => a.canVeto).map((a) => a.codename)).toEqual(['Palermo'])
    expect(corpusEleDomain.entry).toBe('Tokio')
    expect(corpusEleDomain.closer).toBe('Profesor')
    expect(corpusEleDomain.taskKinds).toEqual(['muestra', 'produccion'])
    expect(NIVELES).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
  })

  it('cada agente ve solo sus herramientas y todas existen', () => {
    expect(Object.fromEntries(corpusEleDomain.agents.map((a) => [a.codename, a.tools]))).toEqual({
      Tokio: ['leerPcic', 'buscarPiezas'],
      Denver: ['webSearch', 'leerEtiquetario', 'buscarPiezas'],
      Estocolmo: ['leerPcic', 'medirNivel'],
      Río: ['leerPcic', 'leerEtiquetario'],
      Berlín: ['leerEtiquetario', 'leerPcic'],
      Lisboa: ['leerEtiquetario', 'leerPcic'],
      Nairobi: [],
      Palermo: ['leerEtiquetario'],
      Helsinki: ['escribirPieza', 'escribirAnotaciones'],
      Profesor: ['readAll'],
    })
    for (const a of corpusEleDomain.agents) for (const t of a.tools) expect(corpusEleDomain.tools[t], `herramienta ${t} de ${a.codename}`).toBeDefined()
    // Solo Helsinki escribe en la Clínica; solo Río redacta (no tiene herramientas de escritura).
    const escriben = corpusEleDomain.agents.filter((a) => a.tools.some((t) => t.startsWith('escribir'))).map((a) => a.codename)
    expect(escriben).toEqual(['Helsinki'])
  })

  it('los prompts llevan las reglas de la casa', () => {
    for (const a of corpusEleDomain.agents) {
      expect(a.systemPrompt).toMatch(/PCIC ANTES QUE NADA/)
      expect(a.systemPrompt).toMatch(/ETIQUETARIO CERRADO/)
      expect(a.systemPrompt).toMatch(/NUNCA INVENTAR GRANADA/)
      expect(a.systemPrompt).toMatch(/SEÑALAR, NO CORREGIR/)
    }
  })

  it('muestra: Lisboa devuelve a Río una vez, Palermo no veta, Helsinki registra y el Profesor cierra', async () => {
    const mem = createMemoryStore()
    let lisboaCalls = 0
    const visitas: string[] = []
    const engine = createEngine(mem.store, async (agent, input) => {
      visitas.push(agent.codename)
      const dossier = { ...(input.handoff.payload as Record<string, unknown>) }
      const i = CHAIN.indexOf(agent.codename)
      if (agent.codename === 'Lisboa' && lisboaCalls++ === 0) return { action: 'return', to: 'Río', payload: dossier, reason: 'el precio del café no lo documentó Denver' }
      if (agent.codename === 'Helsinki') return { action: 'pass', to: 'Profesor', payload: { ...dossier, registro: { piezaId: 'pz-1', estado: 'validada' } } }
      if (agent.codename === 'Profesor') return { action: 'close', payload: { kind: 'muestra', veredicto: 'validada', piezaId: 'pz-1', anotaciones: 6, devoluciones: 1, motivosPalermo: [] } }
      return { action: 'pass', to: CHAIN[i + 1], payload: dossier }
    })
    const { session } = await engine.openSession(corpusEleDomain, { kind: 'muestra', payload: { kind: 'muestra', situacion: 'bar', nivel: 'A2', tipo: 'muestra_habla' }, createdBy: 'test' })
    const s = await engine.runSession(corpusEleDomain, session.id)
    expect(s.status).toBe('closed')
    expect(s.finalReport).toMatchObject({ kind: 'muestra', veredicto: 'validada', piezaId: 'pz-1' })
    expect(mem.events.filter((e) => e.type === 'return')).toHaveLength(1)
    // Río, Berlín y Lisboa se repiten tras la devolución: 10 + 3 traspasos
    expect(mem.handoffs).toHaveLength(13)
    expect(visitas.filter((v) => v === 'Río')).toHaveLength(2)
  })

  it('produccion: Palermo veta y la sesión queda vetada con su motivo', async () => {
    const mem = createMemoryStore()
    const engine = createEngine(mem.store, async (agent, input) => {
      const dossier = input.handoff.payload as Record<string, unknown>
      const i = CHAIN.indexOf(agent.codename)
      if (agent.codename === 'Palermo') return { action: 'veto', payload: dossier, reason: 'objeción 2 pide subjuntivo a un A1: por encima del nivel PCIC' }
      if (agent.codename === 'Profesor') return { action: 'close', payload: { kind: 'produccion', veredicto: 'anotada' } }
      return { action: 'pass', to: CHAIN[i + 1], payload: dossier }
    })
    const { session } = await engine.openSession(corpusEleDomain, {
      kind: 'produccion',
      payload: { kind: 'produccion', ref: '00000000-0000-4000-8000-000000000001', seudonimo: 'p-abc', texto: 'Ayer fui al bar y pedí un café.', nivel: 'A1', consigna: null, lenguaMaterna: 'en', origen: 'redaccion' },
      createdBy: 'test',
    })
    const s = await engine.runSession(corpusEleDomain, session.id)
    expect(s.status).toBe('vetoed')
    expect(mem.events.some((e) => e.type === 'veto' && /nivel PCIC/.test(e.message))).toBe(true)
    // ni Helsinki ni el Profesor llegan a correr
    expect(mem.handoffs.some((h) => h.toAgent.endsWith(':Helsinki') && h.status !== 'pending')).toBe(false)
  })

  it('produccion sin objeciones: cierre limpio en 10 traspasos', async () => {
    const mem = createMemoryStore()
    const engine = createEngine(mem.store, async (agent, input) => {
      const i = CHAIN.indexOf(agent.codename)
      if (agent.codename === 'Profesor') return { action: 'close', payload: { kind: 'produccion', veredicto: 'sin_objeciones', objeciones: 0 } }
      return { action: 'pass', to: CHAIN[i + 1], payload: input.handoff.payload }
    })
    const { session } = await engine.openSession(corpusEleDomain, { kind: 'produccion', payload: { kind: 'produccion', ref: 'r', seudonimo: 'p-1', texto: 'Hola.', nivel: 'A1', origen: 'redaccion' }, createdBy: 'test' })
    const s = await engine.runSession(corpusEleDomain, session.id)
    expect(s.status).toBe('closed')
    expect(s.finalReport).toMatchObject({ veredicto: 'sin_objeciones' })
    expect(mem.handoffs).toHaveLength(10)
  })
})
