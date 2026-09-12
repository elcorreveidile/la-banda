import { and, count, eq } from 'drizzle-orm'
import { db } from '@/db'
import { events, sessions } from '@/db/schema'
import { objections, versions } from '@/db/olvidos'
import { listManuscripts, type ManuscriptRow } from './manuscripts'

export interface OlvidosMetrics {
  manuscripts: ManuscriptRow[]
  sessions: number
  decisions: { publicable: number; con_cambios: number; rechazado: number }
  objectionsByAgent: Record<string, number>
  returns: number
}

/** Métricas del dominio Olvidos (brief §7): manuscritos, veredictos, objeciones por agente, devoluciones de Lisboa. */
export async function olvidosMetrics(): Promise<OlvidosMetrics> {
  const manuscripts = await listManuscripts(30)
  const [s] = await db.select({ n: count() }).from(sessions).where(eq(sessions.domain, 'olvidos'))
  const [r] = await db.select({ n: count() }).from(events).where(and(eq(events.type, 'return'), eq(events.agentId, 'olvidos:Lisboa')))
  const decided = await db.select({ decision: versions.decision, n: count() }).from(versions).groupBy(versions.decision)
  const decisions = { publicable: 0, con_cambios: 0, rechazado: 0 }
  for (const d of decided) if (d.decision && d.decision in decisions) decisions[d.decision as keyof typeof decisions] = Number(d.n)
  const byAgent = await db.select({ agent: objections.agent, n: count() }).from(objections).groupBy(objections.agent)
  return {
    manuscripts,
    sessions: Number(s?.n ?? 0),
    decisions,
    objectionsByAgent: Object.fromEntries(byAgent.map((b) => [b.agent, Number(b.n)])),
    returns: Number(r?.n ?? 0),
  }
}
