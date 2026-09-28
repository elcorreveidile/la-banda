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

/**
 * Escapa los saltos de línea y tabuladores que van en crudo DENTRO de las cadenas de un texto
 * JSON (lo que suele romper un JSON con HTML largo que el modelo escribe a mano).
 */
function escaparControlesEnCadenas(texto: string): string {
  let out = ''
  let enCadena = false
  let escapado = false
  for (const c of texto) {
    if (enCadena) {
      if (escapado) escapado = false
      else if (c === '\\') escapado = true
      else if (c === '"') enCadena = false
      else if (c === '\n') { out += '\\n'; continue }
      else if (c === '\r') { out += '\\r'; continue }
      else if (c === '\t') { out += '\\t'; continue }
    } else if (c === '"') enCadena = true
    out += c
  }
  return out
}

/**
 * Un payload que llega como TEXTO con JSON se convierte en objeto. Pasó en marketing
 * (2026-09-28): Estocolmo entregaba `articuloEn` como cadena JSON, el motor la guardaba tal cual,
 * `revisarArticulos` no lo encontraba y Palermo lo devolvió hasta agotar los traspasos.
 * Devuelve el objeto, el valor sin tocar si no es texto, o `undefined` si es texto con forma
 * de JSON que no se puede leer (la decisión se rechaza y el agente reintenta).
 */
export function normalizarPayload(payload: unknown): unknown {
  if (typeof payload !== 'string') return payload
  const t = payload.trim()
  if (!t.startsWith('{') && !t.startsWith('[')) return payload
  for (const intento of [t, escaparControlesEnCadenas(t)]) {
    try {
      const v: unknown = JSON.parse(intento)
      if (v !== null && typeof v === 'object') return v
    } catch {
      // se prueba la reparación
    }
  }
  return undefined
}

/** Normaliza y valida una decisión cruda. Devuelve un error legible si no cuadra. */
export function parseDecision(raw: unknown): { ok: true; decision: AgentDecision } | { ok: false; error: string } {
  const parsed = DecisionSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ') }
  const d = parsed.data
  if ((d.action === 'pass' || d.action === 'return') && !d.to) return { ok: false, error: `la acción ${d.action} necesita "to"` }
  if ((d.action === 'return' || d.action === 'veto') && !d.reason) return { ok: false, error: `la acción ${d.action} necesita "reason"` }
  const payload = normalizarPayload(d.payload)
  if (payload === undefined)
    return { ok: false, error: '"payload" ha llegado como TEXTO con un JSON que no se puede leer. Envíalo como OBJETO JSON (no como cadena), con cada campo en la raíz' }
  return { ok: true, decision: { action: d.action, to: d.to, payload: payload ?? null, reason: d.reason } }
}
