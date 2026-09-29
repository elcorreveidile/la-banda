/**
 * Manejadores de /api/v1/firewall/revisar (las rutas solo inyectan las dependencias reales;
 * aquí vive la lógica para poder testearla sin Next ni BD).
 *
 * Entrada (POST, Bearer LA_BANDA_API_KEY): la cuarentena de wp-next-starter. Todo campo que
 * no esté en el esquema se ignora (Zod lo quita). `detail` y `userAgent` se recortan a su
 * tope en vez de rechazar (el remitente cuenta caracteres a su manera).
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { MOTIVOS_CUARENTENA } from '@/db/firewall'
import { apiUnauthorized } from '@/lib/apiAuth'
import { abrirRevision, type DepsAbrir } from './cycle'
import { salidaDe } from './veredicto'
import type { FirewallStore } from './store'

const recorte = (max: number) =>
  z
    .string()
    .transform((s) => s.slice(0, max))
    .nullish()
    .transform((s) => (s && s.trim() ? s : null))

export const CuarentenaBody = z.object({
  kind: z.literal('agent-quarantine'),
  logId: z.string().trim().min(1).max(64).nullish(),
  tenantId: z.string().trim().min(1).max(64),
  host: z.string().trim().min(1).max(253),
  target: z.string().trim().min(1).max(200),
  reason: z.enum(MOTIVOS_CUARENTENA),
  detail: recorte(300),
  userAgent: recorte(200),
  createdAt: z.string().datetime({ offset: true }),
})

export interface DepsPost extends DepsAbrir {
  /** Programa el primer tick de la mesa tras responder (`after` de Next). */
  lanzar: (sessionId: string) => void
}

export async function manejarPost(req: Request, deps: DepsPost): Promise<Response> {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const parsed = CuarentenaBody.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 })
  const b = parsed.data

  const r = await abrirRevision(
    { logId: b.logId ?? null, tenantId: b.tenantId, host: b.host, target: b.target, reason: b.reason, detail: b.detail ?? null, userAgent: b.userAgent ?? null, createdAt: new Date(b.createdAt) },
    deps,
  )

  if (r.tipo === 'sin-modelos') return NextResponse.json({ error: 'firewall sin modelo disponible (falta ZAI_API_KEY)' }, { status: 503 })
  if (r.tipo === 'rate-limited') return NextResponse.json({ error: 'rate-limited', limit: r.limite }, { status: 429 })
  if (r.tipo === 'mesa') deps.lanzar(r.sessionId)

  const rev = r.revision
  const terminado = rev.status === 'done' || rev.status === 'failed'
  if (rev.status === 'done' && rev.cached) {
    const s = salidaDe(rev)
    return NextResponse.json({ id: rev.id, status: 'cached', verdict: s.verdict, confidence: s.confidence, rationale: s.rationale, patternKey: s.patternKey, cached: true, decidedAt: s.decidedAt }, { status: 202 })
  }
  // Reintento de un logId ya terminado: se devuelve su estado real (mismo JSON que el GET).
  if (r.tipo === 'existente' && terminado) return NextResponse.json(salidaDe(rev), { status: 202 })
  return NextResponse.json({ id: rev.id, status: 'queued' }, { status: 202 })
}

export async function manejarGet(req: Request, id: string, store: FirewallStore): Promise<Response> {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const rev = await store.get(id)
  if (!rev) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(salidaDe(rev))
}
