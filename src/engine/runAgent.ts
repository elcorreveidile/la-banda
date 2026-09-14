import Anthropic from '@anthropic-ai/sdk'
import type { AgentConfig, AgentDecision, ToolContext, ToolDef } from '@domains/types'
import { DECIDE_TOOL_SCHEMA, parseDecision } from './decision'
import { PROVIDER_TIMEOUT_MS, providerFor, type Provider } from './provider'

/** Lo que el motor entrega a un agente en cada invocación. */
export interface AgentInput {
  domain: string
  task: { kind: string; payload: unknown }
  handoff: { from: string | null; payload: unknown; reason: string | null }
  allowed: { pass: string[]; return: string[]; veto: boolean; close: boolean }
  tools: ToolDef[]
  ctx: ToolContext
}

export type RunAgent = (agent: AgentConfig, input: AgentInput, opciones?: { deadlineMs?: number }) => Promise<AgentDecision>

const DECIDE = 'decide'
const MAX_TOOL_ROUNDS = 8
const MAX_DECIDE_RETRIES = 2
/** Tope de salida por llamada. Con 8000 el dossier del corpus se cortaba y `decide` llegaba sin "action". */
const MAX_TOKENS = 16_000
const AVISO_CORTADA = 'Tu respuesta se ha cortado por longitud. Llama a "decide" otra vez con SOLO tus campos nuevos o corregidos en "payload": el motor conserva el resto del dossier. No repitas el texto ni las listas de los demás.'
/**
 * Presupuesto de tiempo de HERRAMIENTAS por invocación de agente (AGENT_BUDGET_MS, def.
 * 100 s). Al agotarse no se abren más rondas: se pide `decide` con lo que haya. La última
 * llamada puede durar hasta el tope por llamada (180 s), así que el paso queda por
 * debajo de los 300 s del tick (100 + 180 < 300).
 */
export function agentBudgetMs(): number {
  const n = Number(process.env.AGENT_BUDGET_MS)
  return Number.isFinite(n) && n > 0 ? n : 100_000
}

/**
 * Tope DURO por invocación de agente, todas las rondas incluidas (AGENT_DEADLINE_MS, def.
 * 270 s < 300 s del tick). Cada llamada al proveedor se corta en
 * min(PROVIDER_TIMEOUT_MS, lo que quede hasta este tope).
 */
export function agentDeadlineMs(): number {
  const n = Number(process.env.AGENT_DEADLINE_MS)
  return Number.isFinite(n) && n > 0 ? n : 270_000
}

/**
 * Una llamada al modelo en STREAMING con tope propio. El `timeout` del SDK solo cuenta hasta
 * que llegan las cabeceras; sin streaming el servidor no manda nada hasta acabar de generar y
 * un B2 largo en GLM pasaba de 120 s → «Request timed out» (Río y Berlín, 2026-09-14). En
 * streaming las cabeceras llegan enseguida y el texto va goteando; el único tope es este.
 */
async function pedir(client: Anthropic, params: Anthropic.MessageCreateParamsNonStreaming, plazoMs: number): Promise<Anthropic.Message> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), plazoMs)
  try {
    return await client.messages.stream(params, { signal: ac.signal }).finalMessage()
  } catch (err) {
    if (ac.signal.aborted) throw new Error(`sin respuesta del proveedor en ${Math.round(plazoMs / 1000)} s`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function effort(): 'low' | 'medium' | 'high' {
  const e = process.env.ANTHROPIC_EFFORT
  return e === 'low' || e === 'high' ? e : 'medium'
}

/** Marco común que el motor añade al prompt de sistema de cada agente. */
export function engineFraming(agent: AgentConfig, input: AgentInput): string {
  const lines = [
    `Formas parte de La Banda, una cadena de agentes con un trabajo cada uno. Tu codename es ${agent.codename} (${agent.role}).`,
    'No compartes memoria con los demás: solo ves la tarea, el traspaso que recibes y lo que te den tus herramientas.',
    'Cuando termines, llama a la herramienta "decide" UNA sola vez con tu decisión. No respondas con texto suelto.',
    'En "payload" devuelve SOLO tus campos nuevos o corregidos: el motor los funde con el traspaso que has recibido (lo demás se conserva). No repitas el dossier entero.',
    '',
    'Acciones que tienes permitidas:',
  ]
  if (input.allowed.pass.length) lines.push(`- pass → a: ${input.allowed.pass.join(', ')}`)
  if (input.allowed.return.length) lines.push(`- return → a: ${input.allowed.return.join(', ')} (con "reason")`)
  if (input.allowed.veto) lines.push('- veto (con "reason")')
  if (input.allowed.close) lines.push('- close (payload = informe final)')
  lines.push('Cualquier otro destinatario o acción será rechazado por el motor.')
  return lines.join('\n')
}

function userMessage(input: AgentInput): string {
  const parts = [
    `Dominio: ${input.domain}`,
    `Tarea (${input.task.kind}):`,
    JSON.stringify(input.task.payload, null, 2),
    '',
    input.handoff.from ? `Traspaso recibido de ${input.handoff.from}:` : 'Traspaso inicial del motor:',
    JSON.stringify(input.handoff.payload, null, 2),
  ]
  if (input.handoff.reason) parts.push('', `Motivo del traspaso: ${input.handoff.reason}`)
  return parts.join('\n')
}

function esObjetoConAction(v: unknown): boolean {
  return typeof v === 'object' && v !== null && typeof (v as { action?: unknown }).action === 'string'
}

function toAnthropicTool(t: ToolDef): Anthropic.Tool {
  return { name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Tool.InputSchema }
}

/**
 * Invoca al agente con su prompt de sistema y SOLO sus herramientas.
 * Bucle manual: ejecuta herramientas hasta que el modelo llama a `decide`.
 * Proveedor: z.ai (GLM) o Anthropic, según `getProvider()`; `agent.model` lo sobreescribe.
 */
export const runAgentWithAnthropic: RunAgent = (agent, input, opciones) => {
  const { provider, model } = providerFor(agent.model)
  return runAgentWith(provider, { ...agent, model }, input, opciones)
}

/** Igual que `runAgentWithAnthropic` pero con el proveedor inyectado (tests). */
export async function runAgentWith(provider: Provider, agent: AgentConfig, input: AgentInput, opciones: { budgetMs?: number; deadlineMs?: number; now?: () => number } = {}): Promise<AgentDecision> {
  const anthropic = provider.client
  const model = agent.model || provider.model
  const budgetMs = opciones.budgetMs ?? agentBudgetMs()
  const deadlineMs = opciones.deadlineMs ?? agentDeadlineMs()
  const now = opciones.now ?? Date.now
  const inicio = now()
  const domainTools = new Map(input.tools.map((t) => [t.name, t]))
  const decideTool: Anthropic.Tool = { name: DECIDE, description: 'Entrega tu decisión final al motor. Llámala exactamente una vez, al terminar.', input_schema: DECIDE_TOOL_SCHEMA as unknown as Anthropic.Tool.InputSchema }
  const tools: Anthropic.Tool[] = [...input.tools.map(toAnthropicTool), decideTool]
  const system = `${agent.systemPrompt.trim()}\n\n---\n${engineFraming(agent, input)}`
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage(input) }]

  let decideRetries = 0
  let agotado = false
  for (let round = 0; round < MAX_TOOL_ROUNDS + MAX_DECIDE_RETRIES; round++) {
    if (!agotado && round > 0 && now() - inicio > budgetMs) {
      // Sin más herramientas: solo queda decidir con lo que se tiene.
      agotado = true
      messages.push({ role: 'user', content: `Tiempo agotado (${Math.round(budgetMs / 1000)} s): no puedes usar más herramientas. Llama a "decide" AHORA con lo que tienes; si te falta algo, dilo en el payload.` })
    }
    const plazoMs = Math.max(1000, Math.min(PROVIDER_TIMEOUT_MS, deadlineMs - (now() - inicio)))
    const response = await pedir(anthropic, {
      model,
      max_tokens: MAX_TOKENS,
      system,
      tools: agotado ? [decideTool] : tools,
      messages,
      ...(provider.native ? { output_config: { effort: effort() } } : {}),
    }, plazoMs)

    if (response.stop_reason === 'refusal') {
      throw new Error(`${agent.codename}: el modelo rechazó la petición (${response.stop_details?.category ?? 'sin categoría'})`)
    }

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    messages.push({ role: 'assistant', content: response.content })

    const decide = toolUses.find((b) => b.name === DECIDE)
    // Salida cortada por longitud: el proveedor devuelve el tool_use vacío o a medias
    // (llega sin "action"). Se pide la decisión otra vez, corta.
    const cortada = response.stop_reason === 'max_tokens' || (decide !== undefined && !esObjetoConAction(decide.input))
    if (cortada) {
      if (++decideRetries > MAX_DECIDE_RETRIES) throw new Error(`${agent.codename}: respuesta cortada por longitud ${MAX_DECIDE_RETRIES + 1} veces`)
      messages.push(
        decide
          ? { role: 'user', content: [{ type: 'tool_result', tool_use_id: decide.id, content: AVISO_CORTADA, is_error: true }] }
          : { role: 'user', content: AVISO_CORTADA },
      )
      continue
    }
    if (decide) {
      const parsed = parseDecision(decide.input)
      if (parsed.ok) return parsed.decision
      if (++decideRetries > MAX_DECIDE_RETRIES) throw new Error(`${agent.codename}: decisión inválida: ${parsed.error}`)
      messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: decide.id, content: `Decisión inválida: ${parsed.error}. Vuelve a llamar a "decide" corrigiéndolo.`, is_error: true }],
      })
      continue
    }

    if (toolUses.length === 0) {
      if (++decideRetries > MAX_DECIDE_RETRIES) throw new Error(`${agent.codename}: terminó sin llamar a "decide"`)
      messages.push({ role: 'user', content: 'No has llamado a la herramienta "decide". Hazlo ahora con tu decisión.' })
      continue
    }

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const use of toolUses) {
      const tool = domainTools.get(use.name)
      if (!tool) {
        results.push({ type: 'tool_result', tool_use_id: use.id, content: `Herramienta no permitida: ${use.name}`, is_error: true })
        continue
      }
      try {
        const out = await tool.run((use.input ?? {}) as Record<string, unknown>, input.ctx)
        results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(out) })
      } catch (err) {
        results.push({ type: 'tool_result', tool_use_id: use.id, content: `Error: ${err instanceof Error ? err.message : String(err)}`, is_error: true })
      }
    }
    messages.push({ role: 'user', content: results })
  }
  throw new Error(`${agent.codename}: demasiadas rondas sin decidir`)
}
