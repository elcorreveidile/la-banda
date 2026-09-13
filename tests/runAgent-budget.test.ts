import { describe, expect, it, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { runAgentWith, agentBudgetMs, type AgentInput } from '@/engine/runAgent'
import type { AgentConfig } from '@domains/types'
import type { Provider } from '@/engine/provider'

const agent: AgentConfig = { codename: 'Río', role: 'Redacta', canVeto: false, tools: ['leer'], systemPrompt: 'Redacta.' }
const input: AgentInput = {
  domain: 'corpus-ele',
  task: { kind: 'muestra', payload: { kind: 'muestra' } },
  handoff: { from: 'Estocolmo', payload: { kind: 'muestra' }, reason: null },
  allowed: { pass: ['Berlín'], return: [], veto: false, close: false },
  tools: [{ name: 'leer', description: 'lee', inputSchema: { type: 'object', properties: {} }, run: async () => ({ ok: true }) }],
  ctx: { sessionId: 's1', taskId: 't1', agentCodename: 'Río' },
}

/** Respuesta del modelo: usa una herramienta, o decide. */
const mensaje = (id: string, name: string, input: unknown): Anthropic.Message =>
  ({ id, type: 'message', role: 'assistant', model: 'x', stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'tool_use', id, name, input }] }) as unknown as Anthropic.Message
const usaHerramienta = (id: string) => mensaje(id, 'leer', {})
const decide = (id: string) => mensaje(id, 'decide', { action: 'pass', to: 'Berlín', payload: { borrador: 'x' } })
const nombres = (params: Anthropic.MessageCreateParams) => (params.tools ?? []).map((x) => (x as { name: string }).name)

function proveedor(respuestas: Anthropic.Message[]) {
  const create = vi.fn(async (_params: Anthropic.MessageCreateParams) => respuestas.shift()!)
  const provider = { name: 'anthropic', native: false, model: 'm', client: { messages: { create } } as unknown as Anthropic } as Provider
  return { provider, create }
}

describe('presupuesto de tiempo del agente', () => {
  it('por defecto 150 s, configurable por AGENT_BUDGET_MS', () => {
    delete process.env.AGENT_BUDGET_MS
    expect(agentBudgetMs()).toBe(150_000)
    process.env.AGENT_BUDGET_MS = '5000'
    expect(agentBudgetMs()).toBe(5000)
    process.env.AGENT_BUDGET_MS = 'nada'
    expect(agentBudgetMs()).toBe(150_000)
    delete process.env.AGENT_BUDGET_MS
  })

  it('agotado el presupuesto, la siguiente petición solo lleva "decide" y avisa al modelo', async () => {
    // El modelo usa una herramienta y, al recibir solo "decide", decide.
    const { provider, create } = proveedor([usaHerramienta('u1'), decide('d')])
    let t = 0
    const now = () => t
    const p = runAgentWith(provider, agent, input, { budgetMs: 100, now })
    // Tras la primera ronda (herramienta) se pasa el presupuesto.
    t = 500
    const d = await p
    expect(d).toMatchObject({ action: 'pass', to: 'Berlín' })
    expect(create).toHaveBeenCalledTimes(2)
    const primera = create.mock.calls[0][0]
    const segunda = create.mock.calls[1][0]
    expect(nombres(primera)).toEqual(['leer', 'decide'])
    expect(nombres(segunda)).toEqual(['decide'])
    // (el array de mensajes se sigue mutando tras la llamada: se busca el aviso, no la última posición)
    expect(segunda.messages.some((m) => typeof m.content === 'string' && /Tiempo agotado/.test(m.content))).toBe(true)
  })

  it('dentro del presupuesto sigue usando herramientas', async () => {
    const { provider, create } = proveedor([usaHerramienta('u1'), usaHerramienta('u2'), decide('d')])
    const d = await runAgentWith(provider, agent, input, { budgetMs: 10_000, now: () => 0 })
    expect(d.action).toBe('pass')
    expect(create).toHaveBeenCalledTimes(3)
    for (const c of create.mock.calls) expect(nombres(c[0])).toEqual(['leer', 'decide'])
  })
})
