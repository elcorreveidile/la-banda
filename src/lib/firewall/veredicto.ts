/**
 * Del final de la sesión al veredicto, y de la fila al JSON de salida (puro).
 *
 * El veredicto lo da la ACCIÓN del cortafuegos (Palermo), no lo que diga el texto:
 * - sesión `closed` (close) → benign: la cuarentena fue un falso positivo;
 * - sesión `vetoed` (veto)  → malicious: se confirma el bloqueo;
 * - sesión `failed`         → sin veredicto (la revisión queda `failed`).
 * `confidence` y `rationale` salen del payload del cierre/veto.
 */

import type { SessionStatus } from '@/db/schema'
import type { Revision, VeredictoRevision } from '@/db/firewall'

export interface Veredicto {
  verdict: VeredictoRevision
  confidence: number
  rationale: string
}

const MAX_RATIONALE = 500
const CONFIANZA_SIN_DATO = 0.5

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

export function acotarConfianza(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return null
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100
}

/** Quita el fragmento literal del razonamiento (no debe salir de aquí en claro) y recorta. */
export function limpiarRationale(texto: unknown, detail: string | null | undefined): string {
  let s = typeof texto === 'string' ? texto.replace(/\s+/g, ' ').trim() : ''
  const d = detail?.trim()
  if (d && d.length >= 8 && s.includes(d)) s = s.split(d).join('«fragmento»')
  return s.length > MAX_RATIONALE ? `${s.slice(0, MAX_RATIONALE - 1)}…` : s
}

/** Veredicto de una sesión terminada; null si sigue abierta o falló. */
export function veredictoDeSesion(status: SessionStatus, finalReport: unknown, detail?: string | null): Veredicto | null {
  if (status !== 'closed' && status !== 'vetoed') return null
  const fr = obj(finalReport)
  // close: el payload ES el finalReport; veto: el motor lo guarda en { vetoedBy, reason, payload }.
  const p = status === 'vetoed' ? (obj(fr?.payload) ?? fr) : fr
  const confidence = acotarConfianza(p?.confidence) ?? CONFIANZA_SIN_DATO
  const bruto = p?.rationale ?? (status === 'vetoed' ? fr?.reason : undefined)
  const rationale = limpiarRationale(bruto, detail) || (status === 'vetoed' ? 'Bloqueo confirmado por el cortafuegos.' : 'Falso positivo según el cortafuegos.')
  return { verdict: status === 'vetoed' ? 'malicious' : 'benign', confidence, rationale }
}

/** JSON del contrato de salida (GET y webhook). */
export interface SalidaRevision {
  id: string
  logId: string | null
  tenantId: string
  status: Revision['status']
  verdict: VeredictoRevision | null
  confidence: number | null
  rationale: string | null
  patternKey: string
  cached: boolean
  decidedAt: string | null
}

export function salidaDe(r: Revision): SalidaRevision {
  return {
    id: r.id,
    logId: r.logId,
    tenantId: r.tenantId,
    status: r.status,
    verdict: r.verdict ?? null,
    confidence: r.confidence ?? null,
    rationale: r.rationale ?? null,
    patternKey: r.patternKey,
    cached: r.cached,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
  }
}
