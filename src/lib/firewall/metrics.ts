import { desc, gte } from 'drizzle-orm'
import { db } from '@/db'
import { firewallRevisiones } from '@/db/firewall'

/** Revisión tal como la ve el panel: SIN fragmento ni user-agent (datos de persona). */
export interface RevisionPanel {
  id: string
  tenantId: string
  host: string
  reason: string
  status: string
  verdict: string | null
  confidence: number | null
  rationale: string | null
  cached: boolean
  avisoEstado: string
  createdAt: Date
}

export interface FirewallMetrics {
  recientes: RevisionPanel[]
  ultimos7d: { total: number; mesas: number; cache: number; maliciosas: number; benignas: number; fallidas: number; avisosPendientes: number }
}

/** Métricas del dominio firewall para la pestaña del panel (últimos 7 días). */
export async function firewallMetrics(now = Date.now()): Promise<FirewallMetrics> {
  const r = firewallRevisiones
  const cols = { id: r.id, tenantId: r.tenantId, host: r.host, reason: r.reason, status: r.status, verdict: r.verdict, confidence: r.confidence, rationale: r.rationale, cached: r.cached, avisoEstado: r.avisoEstado, createdAt: r.createdAt, origenId: r.origenId }
  const filas = await db.select(cols).from(r).where(gte(r.createdAt, new Date(now - 7 * 24 * 60 * 60_000))).orderBy(desc(r.createdAt)).limit(500)
  return {
    recientes: filas.slice(0, 30),
    ultimos7d: {
      total: filas.length,
      mesas: filas.filter((f) => !f.cached && !f.origenId).length,
      cache: filas.filter((f) => f.cached).length,
      maliciosas: filas.filter((f) => f.verdict === 'malicious' && f.status === 'done').length,
      benignas: filas.filter((f) => f.verdict === 'benign').length,
      fallidas: filas.filter((f) => f.status === 'failed').length,
      avisosPendientes: filas.filter((f) => f.avisoEstado === 'pendiente').length,
    },
  }
}
