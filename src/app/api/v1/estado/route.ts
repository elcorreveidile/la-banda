import { NextResponse } from 'next/server'
import { desc, gte } from 'drizzle-orm'
import { db } from '@/db'
import { sessions } from '@/db/schema'
import { firewallRevisiones } from '@/db/firewall'
import { apiUnauthorized } from '@/lib/apiAuth'
import { VENTANA_FIREWALL_DIAS, VENTANA_SESIONES_DIAS, resumirEstado } from '@/lib/estado'

export const dynamic = 'force-dynamic'

const DIA_MS = 86_400_000

/**
 * GET /api/v1/estado → resumen de La Banda para el panel del superadmin de WordNext
 * (sesiones de 7 días por dominio, últimas y fallidas, y el firewall de 30 días). Mismo
 * Bearer que el resto de la API v1. Solo cifras y metadatos, nunca contenido.
 */
export async function GET(req: Request) {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const ahora = new Date()
  const [sesiones, revisiones] = await Promise.all([
    db
      .select({ id: sessions.id, domain: sessions.domain, status: sessions.status, startedAt: sessions.startedAt, closedAt: sessions.closedAt })
      .from(sessions)
      .where(gte(sessions.startedAt, new Date(ahora.getTime() - VENTANA_SESIONES_DIAS * DIA_MS)))
      .orderBy(desc(sessions.startedAt))
      .limit(2000),
    db
      .select({ status: firewallRevisiones.status, verdict: firewallRevisiones.verdict, cached: firewallRevisiones.cached })
      .from(firewallRevisiones)
      .where(gte(firewallRevisiones.createdAt, new Date(ahora.getTime() - VENTANA_FIREWALL_DIAS * DIA_MS)))
      .limit(10000),
  ])
  return NextResponse.json(resumirEstado({ sesiones, revisiones, appUrl: process.env.APP_URL, ahora }), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
