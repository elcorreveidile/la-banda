import { and, count, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { events, sessions } from '@/db/schema'
import { sites, type Site } from '@/db/sitios'
import { listSites } from './sites'

export interface SitiosMetrics {
  /** Sitios recientes (para la lista de la tarjeta). */
  recientes: Site[]
  sessions: number
  porEstado: { recibido: number; entregado: number; error_entrega: number }
  /** Devoluciones de Lisboa en este dominio. */
  returns: number
}

/** Métricas del dominio sitios para la tarjeta del panel. */
export async function sitiosMetrics(): Promise<SitiosMetrics> {
  const recientes = await listSites(30)
  const [s] = await db.select({ n: count() }).from(sessions).where(eq(sessions.domain, 'sitios'))
  const porEstadoRows = await db
    .select({ estado: sites.estado, n: count() })
    .from(sites)
    .where(inArray(sites.estado, ['recibido', 'entregado', 'error_entrega']))
    .groupBy(sites.estado)
  const porEstado = { recibido: 0, entregado: 0, error_entrega: 0 }
  for (const row of porEstadoRows) if (row.estado in porEstado) porEstado[row.estado as keyof typeof porEstado] = Number(row.n)
  const [r] = await db.select({ n: count() }).from(events).where(and(eq(events.type, 'return'), eq(events.agentId, 'sitios:Lisboa')))
  return {
    recientes,
    sessions: Number(s?.n ?? 0),
    porEstado,
    returns: Number(r?.n ?? 0),
  }
}
