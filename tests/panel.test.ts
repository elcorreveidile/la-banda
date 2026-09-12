import { describe, expect, it } from 'vitest'
import { agentStates, type HandoffView } from '@/lib/panel/sessionView'

const h = (to: string, status: string, from: string | null = null): HandoffView => ({ id: `${from}-${to}-${status}`, from, to, status, reason: null, createdAt: '2026-01-01T00:00:00Z' })

describe('estado de los agentes en el panel', () => {
  it('esperando con traspaso pendiente, trabajando tras agent_started, hecho tras decidir', () => {
    const states = agentStates(
      'toy',
      [
        { type: 'session_opened', codename: null },
        { type: 'agent_started', codename: 'Tokio' },
        { type: 'pass', codename: 'Tokio' },
      ],
      [h('Tokio', 'accepted'), h('Palermo', 'pending', 'Tokio')],
    )
    expect(states).toEqual([
      { codename: 'Tokio', role: 'Proponente', state: 'hecho' },
      { codename: 'Palermo', role: 'Veto', state: 'esperando' },
    ])
    const working = agentStates('toy', [{ type: 'agent_started', codename: 'Palermo' }], [h('Palermo', 'pending', 'Tokio')])
    expect(working.find((a) => a.codename === 'Palermo')?.state).toBe('trabajando')
  })

  it('sin sesión todos inactivos y en el orden del dominio', () => {
    const states = agentStates('trading', [], [])
    expect(states.map((a) => a.codename)).toEqual(['Tokio', 'Denver', 'Estocolmo', 'Río', 'Berlín', 'Lisboa', 'Nairobi', 'Palermo', 'Helsinki', 'Profesor'])
    expect(new Set(states.map((a) => a.state))).toEqual(new Set(['inactivo']))
  })
})
