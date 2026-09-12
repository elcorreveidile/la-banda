import { and, asc, eq, gt } from 'drizzle-orm'
import { db } from '@/db'
import { events, handoffs, sessions, tasks } from '@/db/schema'
import { codenameOf } from '@/engine/store'
import { getDomain } from '@domains/index'

export interface LogEvent {
  id: number
  type: string
  message: string
  codename: string | null
  createdAt: string
}

export interface HandoffView {
  id: string
  from: string | null
  to: string
  status: string
  reason: string | null
  createdAt: string
}

export type AgentState = 'inactivo' | 'trabajando' | 'esperando' | 'hecho'

export interface AgentView {
  codename: string
  role: string
  state: AgentState
}

export interface SessionView {
  session: { id: string; domain: string; status: string; startedAt: string; closedAt: string | null; finalReport: unknown }
  events: LogEvent[]
  handoffs: HandoffView[]
  agents: AgentView[]
}

const DECIDED = new Set(['pass', 'return', 'veto', 'close', 'agent_error', 'transition_rejected'])

/** Estado de cada agente del dominio a partir de traspasos y eventos de la sesión. */
export function agentStates(domain: string, allEvents: { type: string; codename: string | null }[], hs: HandoffView[]): AgentView[] {
  const d = getDomain(domain)
  return d.agents.map((a) => {
    const mine = allEvents.filter((e) => e.codename === a.codename)
    const last = mine.at(-1)
    let state: AgentState = 'inactivo'
    if (last?.type === 'agent_started') state = 'trabajando'
    else if (hs.some((h) => h.to === a.codename && h.status === 'pending')) state = 'esperando'
    else if (last && DECIDED.has(last.type)) state = 'hecho'
    return { codename: a.codename, role: a.role, state }
  })
}

/** Vista completa (o incremental por `afterEventId`) de una sesión para el panel. */
export async function sessionView(sessionId: string, afterEventId = 0): Promise<SessionView | null> {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
  if (!session) return null

  const evRows = await db
    .select()
    .from(events)
    .where(and(eq(events.sessionId, sessionId), gt(events.id, afterEventId)))
    .orderBy(asc(events.id))
    .limit(500)
  const allForState = afterEventId > 0 ? await db.select({ type: events.type, agentId: events.agentId }).from(events).where(eq(events.sessionId, sessionId)).orderBy(asc(events.id)) : evRows

  const hRows = await db
    .select({ h: handoffs })
    .from(handoffs)
    .innerJoin(tasks, eq(handoffs.taskId, tasks.id))
    .where(eq(tasks.sessionId, sessionId))
    .orderBy(asc(handoffs.createdAt), asc(handoffs.id))

  const hs: HandoffView[] = hRows.map(({ h }) => ({
    id: h.id,
    from: h.fromAgent ? codenameOf(h.fromAgent) : null,
    to: codenameOf(h.toAgent),
    status: h.status,
    reason: h.reason,
    createdAt: h.createdAt.toISOString(),
  }))

  return {
    session: { id: session.id, domain: session.domain, status: session.status, startedAt: session.startedAt.toISOString(), closedAt: session.closedAt?.toISOString() ?? null, finalReport: session.finalReport },
    events: evRows.map((e) => ({ id: e.id, type: e.type, message: e.message, codename: e.agentId ? codenameOf(e.agentId) : null, createdAt: e.createdAt.toISOString() })),
    handoffs: hs,
    agents: agentStates(
      session.domain,
      allForState.map((e) => ({ type: e.type, codename: e.agentId ? codenameOf(e.agentId) : null })),
      hs,
    ),
  }
}
