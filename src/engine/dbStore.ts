import { and, asc, count, eq, inArray, lt, ne } from 'drizzle-orm'
import type { Db } from '@/db'
import { agents, events, handoffs, sessions, tasks } from '@/db/schema'
import type { DomainConfig } from '@domains/types'
import { agentId, type EngineStore } from './store'

const uuid = () => crypto.randomUUID()

/** Implementación real del almacén sobre Drizzle + Neon. */
export function createDbStore(db: Db): EngineStore {
  return {
    async ensureAgents(domain: DomainConfig) {
      const out = []
      for (const a of domain.agents) {
        const row = {
          id: agentId(domain.name, a.codename),
          domain: domain.name,
          codename: a.codename,
          role: a.role,
          systemPrompt: a.systemPrompt,
          tools: a.tools,
          canVeto: a.canVeto,
        }
        const [saved] = await db
          .insert(agents)
          .values(row)
          .onConflictDoUpdate({ target: agents.id, set: { role: row.role, systemPrompt: row.systemPrompt, tools: row.tools, canVeto: row.canVeto } })
          .returning()
        out.push(saved)
      }
      return out
    },

    async createSession(domain) {
      const [s] = await db.insert(sessions).values({ id: uuid(), domain }).returning()
      return s
    },

    async getSession(id) {
      const [s] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1)
      return s ?? null
    },

    async closeSession(id, status, finalReport) {
      const [s] = await db
        .update(sessions)
        .set({ status, closedAt: new Date(), finalReport: finalReport ?? null })
        .where(eq(sessions.id, id))
        .returning()
      return s
    },

    async openSessions(domain) {
      return db.select().from(sessions).where(and(eq(sessions.domain, domain), eq(sessions.status, 'open'))).orderBy(asc(sessions.startedAt))
    },

    async closedSessionsBefore(domain, before) {
      return db
        .select()
        .from(sessions)
        .where(and(eq(sessions.domain, domain), ne(sessions.status, 'open'), lt(sessions.closedAt, before)))
        .orderBy(asc(sessions.closedAt))
    },

    async deleteSession(id) {
      // Orden por dependencias (FK): eventos → traspasos → tareas → sesión. Sin transacción
      // (neon-http): si algo falla a medias, la siguiente purga lo termina.
      const ts = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.sessionId, id))
      const taskIds = ts.map((t) => t.id)
      await db.delete(events).where(eq(events.sessionId, id))
      if (taskIds.length) await db.delete(handoffs).where(inArray(handoffs.taskId, taskIds))
      await db.delete(tasks).where(eq(tasks.sessionId, id))
      await db.delete(sessions).where(eq(sessions.id, id))
    },

    async createTask(input) {
      const [t] = await db.insert(tasks).values({ id: uuid(), ...input }).returning()
      return t
    },

    async updateTaskStatus(id, status) {
      await db.update(tasks).set({ status }).where(eq(tasks.id, id))
    },

    async createHandoff(input) {
      const [h] = await db.insert(handoffs).values({ id: uuid(), ...input, reason: input.reason ?? null }).returning()
      return h
    },

    async updateHandoff(id, patch) {
      await db.update(handoffs).set(patch).where(eq(handoffs.id, id))
    },

    async nextPendingHandoff(sessionId) {
      const [row] = await db
        .select({ handoff: handoffs, task: tasks })
        .from(handoffs)
        .innerJoin(tasks, eq(handoffs.taskId, tasks.id))
        .where(and(eq(tasks.sessionId, sessionId), eq(handoffs.status, 'pending')))
        .orderBy(asc(handoffs.createdAt), asc(handoffs.id))
        .limit(1)
      return row ?? null
    },

    async countHandoffs(sessionId) {
      const [row] = await db
        .select({ n: count() })
        .from(handoffs)
        .innerJoin(tasks, eq(handoffs.taskId, tasks.id))
        .where(eq(tasks.sessionId, sessionId))
      return Number(row?.n ?? 0)
    },

    async addEvent(event) {
      const [e] = await db.insert(events).values(event).returning()
      return e
    },
  }
}
