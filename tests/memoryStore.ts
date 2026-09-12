import type { DomainConfig } from '@domains/types'
import type { Agent, Event, Handoff, Session, Task } from '@/db/schema'
import { agentId, type EngineStore, type NewEvent } from '@/engine/store'

/** Almacén en memoria con la misma semántica que el de Drizzle, para tests. */
export function createMemoryStore() {
  const agents = new Map<string, Agent>()
  const sessions = new Map<string, Session>()
  const tasks = new Map<string, Task>()
  const handoffs: Handoff[] = []
  const events: Event[] = []
  let seq = 0
  const id = () => `id-${++seq}`
  const now = () => new Date(2026, 0, 1, 0, 0, seq)

  const store: EngineStore = {
    async ensureAgents(domain: DomainConfig) {
      return domain.agents.map((a) => {
        const row: Agent = { id: agentId(domain.name, a.codename), domain: domain.name, codename: a.codename, role: a.role, systemPrompt: a.systemPrompt, tools: a.tools, canVeto: a.canVeto }
        agents.set(row.id, row)
        return row
      })
    },
    async createSession(domain) {
      const s: Session = { id: id(), domain, startedAt: now(), closedAt: null, status: 'open', finalReport: null }
      sessions.set(s.id, s)
      return s
    },
    async getSession(sid) {
      return sessions.get(sid) ?? null
    },
    async closeSession(sid, status, finalReport) {
      const s = sessions.get(sid)!
      Object.assign(s, { status, closedAt: now(), finalReport: finalReport ?? null })
      return s
    },
    async createTask(input) {
      const t: Task = { id: id(), status: 'pending', createdAt: now(), ...input }
      tasks.set(t.id, t)
      return t
    },
    async updateTaskStatus(tid, status) {
      tasks.get(tid)!.status = status
    },
    async createHandoff(input) {
      const h: Handoff = { id: id(), status: 'pending', createdAt: now(), reason: input.reason ?? null, taskId: input.taskId, fromAgent: input.fromAgent, toAgent: input.toAgent, payload: input.payload }
      handoffs.push(h)
      return h
    },
    async updateHandoff(hid, patch) {
      Object.assign(handoffs.find((h) => h.id === hid)!, patch)
    },
    async nextPendingHandoff(sid) {
      const h = handoffs.find((h) => h.status === 'pending' && tasks.get(h.taskId)?.sessionId === sid)
      return h ? { handoff: h, task: tasks.get(h.taskId)! } : null
    },
    async countHandoffs(sid) {
      return handoffs.filter((h) => tasks.get(h.taskId)?.sessionId === sid).length
    },
    async addEvent(e: NewEvent) {
      const row: Event = { id: ++seq, createdAt: now(), ...e }
      events.push(row)
      return row
    },
  }
  return { store, agents, sessions, tasks, handoffs, events }
}
