import { describe, expect, it } from 'vitest'
import { peticionesDomain } from '@domains/peticiones/config'
import { validateDomain } from '@domains/types'
import { componerInformeDesdeDossier, componerInformeDesdeFinalReport } from '@/lib/peticiones/informe'
import { agotadoAviso, venceAviso } from '@/lib/peticiones/webhook'
import { createEngine } from '@/engine/orchestrator'
import { createMemoryStore } from './memoryStore'

const CHAIN = ['Tokio', 'Denver', 'Estocolmo', 'Río', 'Berlín', 'Lisboa', 'Nairobi', 'Palermo', 'Helsinki', 'Profesor']

describe('dominio peticiones', () => {
  it('es coherente y sigue el grafo lineal', () => {
    expect(() => validateDomain(peticionesDomain)).not.toThrow()
    expect(peticionesDomain.agents.map((a) => a.codename)).toEqual(CHAIN)
    for (let i = 0; i < CHAIN.length - 1; i++) expect(peticionesDomain.transitions[CHAIN[i]]).toEqual([CHAIN[i + 1]])
    expect(peticionesDomain.returns).toEqual({ Lisboa: ['Tokio', 'Denver', 'Estocolmo', 'Río', 'Berlín'] })
    expect(peticionesDomain.agents.filter((a) => a.canVeto).map((a) => a.codename)).toEqual(['Palermo'])
    expect(peticionesDomain.closer).toBe('Profesor')
    expect(peticionesDomain.taskKinds).toEqual(['peticion'])
  })

  it('cada agente tiene solo sus herramientas', () => {
    expect(Object.fromEntries(peticionesDomain.agents.map((a) => [a.codename, a.tools]))).toEqual({
      Tokio: ['leerPeticion'],
      Denver: ['leerPeticion', 'webSearch'],
      Estocolmo: ['leerPeticion'],
      Río: ['leerPeticion'],
      Berlín: ['leerPeticion', 'webSearch'],
      Lisboa: ['leerPeticion'],
      Nairobi: [],
      Palermo: ['leerPeticion'],
      Helsinki: ['registrarInforme'],
      Profesor: ['readAll'],
    })
  })

  it('los prompts piden SOLO el campo propio y Helsinki pasa a Profesor siempre', () => {
    for (const a of peticionesDomain.agents) expect(a.systemPrompt).toMatch(/SOLO TU CAMPO NUEVO EN LA RAÍZ/i)
    expect(peticionesDomain.agents.find((a) => a.codename === 'Palermo')?.systemPrompt).toMatch(/Helsinki SIEMPRE/)
    expect(peticionesDomain.agents.find((a) => a.codename === 'Río')?.systemPrompt).toMatch(/ÚNICO que redacta/)
  })

  it('la cadena completa cierra con el informe del Profesor (con una devolución de Lisboa)', async () => {
    const mem = createMemoryStore()
    let lisboaCalls = 0
    const engine = createEngine(mem.store, async (agent, input) => {
      const i = CHAIN.indexOf(agent.codename)
      const payload = input.handoff.payload as Record<string, unknown>
      if (agent.codename === 'Lisboa' && lisboaCalls++ === 0) return { action: 'return', to: 'Río', payload, reason: 'el borrador no responde a la pregunta 3 del encuadre' }
      if (agent.codename === 'Helsinki') return { action: 'pass', to: 'Profesor', payload: { ...payload, registro: { peticionId: 'p1', estado: 'completada' } } }
      if (agent.codename === 'Profesor') return { action: 'close', payload: { resultado: 'completada', titulo: 'Informe', resumenEjecutivo: 'resumen', informe: 'líneas' } }
      return { action: 'pass', to: CHAIN[i + 1], payload: { ...payload, [campoDe(agent.codename)]: 'x' } }
    })
    const { session } = await engine.openSession(peticionesDomain, { kind: 'peticion', payload: { kind: 'peticion', peticionId: 'p1', titulo: 'Prueba' }, createdBy: 'test' })
    const s = await engine.runSession(peticionesDomain, session.id)
    expect(s.status).toBe('closed')
    expect(s.finalReport).toMatchObject({ resultado: 'completada' })
    expect(mem.events.filter((e) => e.type === 'return')).toHaveLength(1)
  })
})

describe('informe desde el dossier', () => {
  it('toma la versión más reciente de cada campo y exige el borrador de Río', () => {
    // Orden del contrato (payloadsDeTarea): del más reciente al más antiguo.
    const payloads = [
      { resumenEjecutivo: 'resumen', veredictoPalermo: { aprueba: true } },
      { informeBorrador: { titulo: 'v2', cuerpo: 'segunda' }, criterios: [{ n: 1 }] },
      { informeBorrador: { titulo: 'v1', cuerpo: 'primera' } },
    ]
    const informe = componerInformeDesdeDossier(payloads, 'Título de la petición')
    expect(informe).toMatchObject({ titulo: 'v2', cuerpo: 'segunda', resumenEjecutivo: 'resumen' })
    expect(informe?.criterios).toEqual([{ n: 1 }])
    expect(informe?.verificacion).toBeNull()
  })

  it('devuelve null sin borrador con cuerpo', () => {
    expect(componerInformeDesdeDossier([{ resumenEjecutivo: 'resumen' }], 'T')).toBeNull()
    expect(componerInformeDesdeDossier([{ informeBorrador: { titulo: 'x', cuerpo: '   ' } }], 'T')).toBeNull()
  })

  it('la guarda de huecos compone desde el finalReport del Profesor', () => {
    const informe = componerInformeDesdeFinalReport({ resultado: 'completada', titulo: 'T', resumenEjecutivo: 'r', informe: 'cuerpo del cierre' }, 'petición')
    expect(informe).toMatchObject({ titulo: 'T', resumenEjecutivo: 'r', cuerpo: 'cuerpo del cierre' })
    expect(componerInformeDesdeFinalReport({ resultado: 'completada' }, 'petición')).toBeNull()
    expect(componerInformeDesdeFinalReport(null, 'petición')).toBeNull()
  })
})

describe('backoff del webhook', () => {
  const MIN = 60_000
  it('no vence antes del backoff y sí después', () => {
    const p = { avisoEstado: 'pendiente' as const, avisoIntentos: 1, avisoUltimoAt: new Date(1_000_000) }
    expect(venceAviso(p, 1_000_000 + 30_000)).toBe(false)
    expect(venceAviso(p, 1_000_000 + MIN)).toBe(true)
  })

  it('escala el backoff por intento (1, 5, 15, 60 min)', () => {
    const base = 1_000_000
    expect(venceAviso({ avisoEstado: 'pendiente', avisoIntentos: 0, avisoUltimoAt: new Date(base) }, base + MIN)).toBe(true)
    expect(venceAviso({ avisoEstado: 'pendiente', avisoIntentos: 1, avisoUltimoAt: new Date(base) }, base + MIN)).toBe(true)
    expect(venceAviso({ avisoEstado: 'pendiente', avisoIntentos: 2, avisoUltimoAt: new Date(base) }, base + 5 * MIN)).toBe(true)
    expect(venceAviso({ avisoEstado: 'pendiente', avisoIntentos: 4, avisoUltimoAt: new Date(base) }, base + 30 * MIN)).toBe(false)
    expect(venceAviso({ avisoEstado: 'pendiente', avisoIntentos: 4, avisoUltimoAt: new Date(base) }, base + 60 * MIN)).toBe(true)
  })

  it('agota a los 12 intentos o tras 24 h sin entregar', () => {
    const base = 1_000_000
    expect(agotadoAviso({ avisoEstado: 'pendiente', avisoIntentos: 12, avisoUltimoAt: new Date(base) }, base + MIN)).toBe(true)
    expect(agotadoAviso({ avisoEstado: 'pendiente', avisoIntentos: 3, avisoUltimoAt: new Date(base) }, base + 25 * 60 * MIN)).toBe(true)
    expect(agotadoAviso({ avisoEstado: 'pendiente', avisoIntentos: 3, avisoUltimoAt: new Date(base) }, base + 2 * 60 * MIN)).toBe(false)
    expect(agotadoAviso({ avisoEstado: 'enviado', avisoIntentos: 99, avisoUltimoAt: new Date(base) }, base + 25 * 60 * MIN)).toBe(false)
  })
})

function campoDe(codename: string): string {
  const campos: Record<string, string> = {
    Tokio: 'encuadre',
    Denver: 'investigacion',
    Estocolmo: 'criterios',
    Río: 'informeBorrador',
    Berlín: 'verificacion',
    Lisboa: 'coherencia',
    Nairobi: 'resumenEjecutivo',
    Palermo: 'veredictoPalermo',
  }
  return campos[codename] ?? 'extra'
}
