import type { AgentConfig, AgentDecision, DomainConfig } from '@domains/types'
import type { Handoff, Session, Task } from '@/db/schema'
import { agentId, codenameOf, type EngineStore } from './store'
import type { AgentInput, RunAgent } from './runAgent'

export interface StepResult {
  session: Session
  /** true si no queda nada por hacer (sesión cerrada o sin traspasos pendientes). */
  done: boolean
}

export interface Engine {
  /** Abre una sesión con una tarea y siembra el primer traspaso hacia `domain.entry`. */
  openSession(domain: DomainConfig, task: { kind: string; payload: unknown; createdBy: string }): Promise<{ session: Session; task: Task; handoff: Handoff }>
  /** Procesa UN traspaso pendiente (una invocación de agente). Base de la cadena de ticks. */
  step(domain: DomainConfig, sessionId: string): Promise<StepResult>
  /** Bucle: consume traspasos pendientes hasta que no queden o la sesión termine. */
  runSession(domain: DomainConfig, sessionId: string): Promise<Session>
}

function short(v: unknown, max = 160): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  if (!s) return ''
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

/** Una decisión que el grafo del dominio no permite. */
function rejectionReason(domain: DomainConfig, agent: AgentConfig, d: AgentDecision): string | null {
  switch (d.action) {
    case 'pass':
      return (domain.transitions[agent.codename] ?? []).includes(d.to!) ? null : `${agent.codename} → ${d.to} no está en el grafo de traspasos`
    case 'return':
      return (domain.returns[agent.codename] ?? []).includes(d.to!) ? null : `${agent.codename} no puede devolver a ${d.to}`
    case 'veto':
      return agent.canVeto ? null : `${agent.codename} no tiene veto`
    case 'close':
      return domain.closer === agent.codename ? null : `${agent.codename} no puede cerrar la sesión (cierra ${domain.closer})`
  }
}

export function createEngine(store: EngineStore, runAgent: RunAgent): Engine {
  return {
    async openSession(domain, input) {
      await store.ensureAgents(domain)
      const session = await store.createSession(domain.name)
      await store.addEvent({ sessionId: session.id, agentId: null, type: 'session_opened', message: `Sesión abierta en ${domain.name} por ${input.createdBy}` })
      const task = await store.createTask({ sessionId: session.id, kind: input.kind, payload: input.payload, createdBy: input.createdBy })
      const entry = agentId(domain.name, domain.entry)
      const handoff = await store.createHandoff({ taskId: task.id, fromAgent: null, toAgent: entry, payload: input.payload })
      await store.addEvent({ sessionId: session.id, agentId: null, type: 'handoff_created', message: `Tarea ${task.kind} entregada a ${domain.entry}` })
      return { session, task, handoff }
    },

    async runSession(domain, sessionId) {
      for (;;) {
        const r = await this.step(domain, sessionId)
        if (r.done) return r.session
      }
    },

    async step(domain, sessionId) {
      const agentsByCodename = new Map(domain.agents.map((a) => [a.codename, a]))
      function finished(session: Session): StepResult {
        return { session, done: true }
      }

      {
        const session = await store.getSession(sessionId)
        if (!session) throw new Error(`Sesión desconocida: ${sessionId}`)
        if (session.status !== 'open') return finished(session)

        const next = await store.nextPendingHandoff(sessionId)
        if (!next) return finished(session)
        const { handoff, task } = next

        const steps = await store.countHandoffs(sessionId)
        if (steps > domain.maxSteps) {
          await store.updateHandoff(handoff.id, { status: 'vetoed', reason: 'tope de pasos' })
          await store.updateTaskStatus(task.id, 'failed')
          await store.addEvent({ sessionId, agentId: null, type: 'session_failed', message: `Tope de ${domain.maxSteps} traspasos superado; sesión detenida` })
          return finished(await store.closeSession(sessionId, 'failed'))
        }

        const codename = codenameOf(handoff.toAgent)
        const agent = agentsByCodename.get(codename)
        const thisAgentId = handoff.toAgent
        if (!agent) {
          await store.updateHandoff(handoff.id, { status: 'vetoed', reason: 'agente desconocido' })
          await store.updateTaskStatus(task.id, 'failed')
          await store.addEvent({ sessionId, agentId: null, type: 'session_failed', message: `Agente desconocido en el traspaso: ${handoff.toAgent}` })
          return finished(await store.closeSession(sessionId, 'failed'))
        }

        if (task.status === 'pending') await store.updateTaskStatus(task.id, 'in_progress')
        await store.addEvent({ sessionId, agentId: thisAgentId, type: 'agent_started', message: `${codename} recibe el traspaso${handoff.fromAgent ? ` de ${codenameOf(handoff.fromAgent)}` : ''}` })

        const input: AgentInput = {
          domain: domain.name,
          task: { kind: task.kind, payload: task.payload },
          handoff: { from: handoff.fromAgent ? codenameOf(handoff.fromAgent) : null, payload: handoff.payload, reason: handoff.reason },
          allowed: {
            pass: domain.transitions[codename] ?? [],
            return: domain.returns[codename] ?? [],
            veto: agent.canVeto,
            close: domain.closer === codename,
          },
          tools: agent.tools.map((t) => domain.tools[t]),
          ctx: { sessionId, taskId: task.id, agentCodename: codename },
        }

        let decision: AgentDecision
        try {
          decision = await runAgent(agent, input)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          await store.addEvent({ sessionId, agentId: thisAgentId, type: 'agent_error', message: `${codename} falló: ${short(msg, 300)}` })
          await store.updateHandoff(handoff.id, { status: 'vetoed', reason: `error del agente: ${short(msg, 300)}` })
          await store.updateTaskStatus(task.id, 'failed')
          await store.addEvent({ sessionId, agentId: null, type: 'session_failed', message: `Sesión detenida por error de ${codename}` })
          return finished(await store.closeSession(sessionId, 'failed'))
        }

        const rejection = rejectionReason(domain, agent, decision)
        if (rejection) {
          await store.addEvent({ sessionId, agentId: thisAgentId, type: 'transition_rejected', message: `Traspaso rechazado: ${rejection}` })
          await store.updateHandoff(handoff.id, { status: 'vetoed', reason: `rechazado por el motor: ${rejection}` })
          await store.updateTaskStatus(task.id, 'failed')
          await store.addEvent({ sessionId, agentId: null, type: 'session_failed', message: `Sesión detenida: ${codename} intentó una acción fuera del grafo` })
          return finished(await store.closeSession(sessionId, 'failed'))
        }

        switch (decision.action) {
          case 'pass': {
            await store.updateHandoff(handoff.id, { status: 'accepted' })
            await store.createHandoff({ taskId: task.id, fromAgent: thisAgentId, toAgent: agentId(domain.name, decision.to!), payload: decision.payload })
            await store.addEvent({ sessionId, agentId: thisAgentId, type: 'pass', message: `${codename} pasa a ${decision.to}: ${short(decision.payload)}` })
            break
          }
          case 'return': {
            await store.updateHandoff(handoff.id, { status: 'returned', reason: decision.reason })
            await store.createHandoff({ taskId: task.id, fromAgent: thisAgentId, toAgent: agentId(domain.name, decision.to!), payload: decision.payload, reason: decision.reason })
            await store.addEvent({ sessionId, agentId: thisAgentId, type: 'return', message: `${codename} devuelve a ${decision.to}: ${decision.reason}` })
            break
          }
          case 'veto': {
            await store.updateHandoff(handoff.id, { status: 'vetoed', reason: decision.reason })
            await store.updateTaskStatus(task.id, 'vetoed')
            await store.addEvent({ sessionId, agentId: thisAgentId, type: 'veto', message: `${codename} veta: ${decision.reason}` })
            return finished(await store.closeSession(sessionId, 'vetoed', { vetoedBy: codename, reason: decision.reason, payload: decision.payload }))
          }
          case 'close': {
            await store.updateHandoff(handoff.id, { status: 'accepted' })
            await store.updateTaskStatus(task.id, 'done')
            await store.addEvent({ sessionId, agentId: thisAgentId, type: 'close', message: `${codename} cierra la sesión: ${short(decision.payload)}` })
            return finished(await store.closeSession(sessionId, 'closed', decision.payload))
          }
        }
        return { session, done: false }
      }
    },
  }
}
