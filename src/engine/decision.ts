import { z } from 'zod'
import type { AgentDecision } from '@domains/types'

export const DecisionSchema = z.object({
  action: z.enum(['pass', 'return', 'veto', 'close']),
  to: z.string().trim().min(1).optional(),
  payload: z.unknown(),
  reason: z.string().trim().min(1).optional(),
})

/** JSON Schema de la herramienta `decide` (lo que ve el modelo). */
export const DECIDE_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['pass', 'return', 'veto', 'close'],
      description: 'pass: entregar al siguiente; return: devolver a un agente anterior; veto: parar; close: cerrar la sesión.',
    },
    to: { type: 'string', description: 'Codename del destinatario. Obligatorio en pass y return.' },
    payload: { type: 'object', additionalProperties: true, description: 'Carga que viaja con el traspaso (objeto JSON; {} si no hay nada). En close, el informe final.' },
    reason: { type: 'string', description: 'Motivo. Obligatorio en return y veto.' },
  },
  required: ['action', 'payload'],
  additionalProperties: false,
} as const

/** Normaliza y valida una decisión cruda. Devuelve un error legible si no cuadra. */
export function parseDecision(raw: unknown): { ok: true; decision: AgentDecision } | { ok: false; error: string } {
  const parsed = DecisionSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ') }
  const d = parsed.data
  if ((d.action === 'pass' || d.action === 'return') && !d.to) return { ok: false, error: `la acción ${d.action} necesita "to"` }
  if ((d.action === 'return' || d.action === 'veto') && !d.reason) return { ok: false, error: `la acción ${d.action} necesita "reason"` }
  return { ok: true, decision: { action: d.action, to: d.to, payload: d.payload ?? null, reason: d.reason } }
}
