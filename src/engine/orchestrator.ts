import type { AgentConfig, AgentDecision, DomainConfig } from '@domains/types'
import type { Handoff, Session, Task } from '@/db/schema'
import { agentId, codenameOf, type EngineStore } from './store'
import type { AgentInput, RunAgent } from './runAgent'

export interface StepResult {
  session: Session
  /** true si no queda nada por hacer (sesión cerrada o sin traspasos pendientes). */
  done: boolean
  /** true si otro tick ya había reclamado el traspaso (no se hizo nada). */
  skipped?: boolean
}

/** Intentos de agente por traspaso antes de dar la sesión por perdida (error del proveedor, tick perdido). */
export const MAX_INTENTOS = 2

export interface Engine {
  /** Abre una sesión con una tarea y siembra el primer traspaso hacia `domain.entry`. */
  openSession(domain: DomainConfig, task: { kind: string; payload: unknown; createdBy: string }): Promise<{ session: Session; task: Task; handoff: Handoff }>
  /** Procesa UN traspaso pendiente (una invocación de agente). Base de la cadena de ticks. */
  step(domain: DomainConfig, sessionId: string): Promise<StepResult>
  /** Bucle: consume traspasos pendientes hasta que no queden o la sesión termine. */
  runSession(domain: DomainConfig, sessionId: string): Promise<Session>
  /** Cierra como fallida una sesión abierta que ya no tiene sentido continuar (datos caducados, ticks perdidos). */
  abandonSession(domain: DomainConfig, sessionId: string, reason: string): Promise<Session>
  /**
   * Revisa las sesiones abiertas del dominio: las más antiguas que `maxAgeMs` se abandonan;
   * las recientes se devuelven en `resume` para que quien llama relance sus ticks.
   */
  recoverOpen(domain: DomainConfig, maxAgeMs: number, now?: number): Promise<{ resume: string[]; abandoned: string[] }>
  /**
   * Purga de traza: borra las sesiones terminadas del dominio con más de `maxAgeMs`
   * (con tareas, traspasos y eventos). Para dominios cuya traza lleva texto de personas
   * (corpus-ele: producciones seudonimizadas de alumnos). Devuelve los ids borrados.
   */
  purgeClosed(domain: DomainConfig, maxAgeMs: number, now?: number): Promise<string[]>
  /**
   * Libera los traspasos `in_progress` reclamados hace más de `maxAgeMs` (el tick que los
   * llevaba murió): vuelven a `pending` con un intento más, o la sesión falla si agotó
   * los intentos. Devuelve los ids de sesión tocados.
   */
  releaseStale(domain: DomainConfig, maxAgeMs: number, now?: number): Promise<{ released: string[]; failed: string[] }>
  /** ¿Hay un agente trabajando ahora mismo en la sesión (traspaso in_progress)? */
  hasInProgress(sessionId: string): Promise<boolean>
  /** ¿Hay un traspaso pendiente en la sesión? */
  hasPending(sessionId: string): Promise<boolean>
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

/** Objeto JSON plano (no array, no null). */
function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * El dossier lo funde el motor: en pass/return, lo que devuelve el agente se superpone
 * al traspaso recibido (fusión superficial; una clave devuelta sustituye a la anterior).
 * Así cada agente puede devolver SOLO sus campos nuevos y el dossier no se corta por
 * longitud en la salida del modelo. Si un lado no es objeto, vale lo del agente.
 */
export function fundirPayload(anterior: unknown, nuevo: unknown): unknown {
  if (!esObjetoPlano(anterior) || !esObjetoPlano(nuevo)) return nuevo
  return { ...anterior, ...nuevo }
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

    async recoverOpen(domain, maxAgeMs, now = Date.now()) {
      const resume: string[] = []
      const abandoned: string[] = []
      for (const s of await store.openSessions(domain.name)) {
        if (now - s.startedAt.getTime() > maxAgeMs) {
          await this.abandonSession(domain, s.id, `sin avance en ${Math.round(maxAgeMs / 60_000)} min; datos caducados`)
          abandoned.push(s.id)
        } else {
          resume.push(s.id)
        }
      }
      return { resume, abandoned }
    },

    async hasInProgress(sessionId) {
      return (await store.inProgressHandoff(sessionId)) !== null
    },

    async hasPending(sessionId) {
      return (await store.nextPendingHandoff(sessionId)) !== null
    },

    async releaseStale(domain, maxAgeMs, now = Date.now()) {
      const released: string[] = []
      const failed: string[] = []
      for (const { handoff, task, session } of await store.staleInProgress(domain.name, new Date(now - maxAgeMs))) {
        const intentos = handoff.intentos + 1
        const codename = codenameOf(handoff.toAgent)
        if (intentos < MAX_INTENTOS) {
          await store.releaseHandoff(handoff.id, intentos)
          await store.addEvent({ sessionId: session.id, agentId: handoff.toAgent, type: 'agent_error', message: `${codename}: tick perdido (sin respuesta en ${Math.round(maxAgeMs / 60_000)} min); se reintentará (intento ${intentos + 1} de ${MAX_INTENTOS})` })
          released.push(session.id)
        } else {
          await store.updateHandoff(handoff.id, { status: 'vetoed', reason: 'tick perdido; intentos agotados' })
          await store.updateTaskStatus(task.id, 'failed')
          await store.addEvent({ sessionId: session.id, agentId: null, type: 'session_failed', message: `Sesión detenida: ${codename} no respondió en ${MAX_INTENTOS} intentos` })
          await store.closeSession(session.id, 'failed')
          failed.push(session.id)
        }
      }
      return { released, failed }
    },

    async purgeClosed(domain, maxAgeMs, now = Date.now()) {
      const borradas: string[] = []
      for (const s of await store.closedSessionsBefore(domain.name, new Date(now - maxAgeMs))) {
        await store.deleteSession(s.id)
        borradas.push(s.id)
      }
      return borradas
    },

    async abandonSession(domain, sessionId, reason) {
      const session = await store.getSession(sessionId)
      if (!session) throw new Error(`Sesión desconocida: ${sessionId}`)
      if (session.status !== 'open') return session
      const next = await store.nextPendingHandoff(sessionId)
      if (next) {
        await store.updateHandoff(next.handoff.id, { status: 'vetoed', reason: `abandonada: ${reason}` })
        await store.updateTaskStatus(next.task.id, 'failed')
      }
      await store.addEvent({ sessionId, agentId: null, type: 'session_failed', message: `Sesión abandonada por el motor: ${reason}` })
      return store.closeSession(sessionId, 'failed', { abandonada: true, reason })
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

        // Bloqueo: un solo tick procesa cada traspaso. Si otro lo reclamó, aquí no hay nada que hacer.
        if (!(await store.claimHandoff(handoff.id, new Date()))) return { session, done: false, skipped: true }

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
          const intentos = handoff.intentos + 1
          if (intentos < MAX_INTENTOS) {
            // Error del proveedor (tiempo, red): el traspaso vuelve a pendiente y la bomba lo relanza.
            await store.addEvent({ sessionId, agentId: thisAgentId, type: 'agent_error', message: `${codename} falló: ${short(msg, 300)} · se reintentará (intento ${intentos + 1} de ${MAX_INTENTOS})` })
            await store.releaseHandoff(handoff.id, intentos)
            return { session, done: false }
          }
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
            const payload = fundirPayload(handoff.payload, decision.payload)
            await store.updateHandoff(handoff.id, { status: 'accepted' })
            await store.createHandoff({ taskId: task.id, fromAgent: thisAgentId, toAgent: agentId(domain.name, decision.to!), payload })
            await store.addEvent({ sessionId, agentId: thisAgentId, type: 'pass', message: `${codename} pasa a ${decision.to}: ${short(decision.payload)}` })
            break
          }
          case 'return': {
            const payload = fundirPayload(handoff.payload, decision.payload)
            await store.updateHandoff(handoff.id, { status: 'returned', reason: decision.reason })
            await store.createHandoff({ taskId: task.id, fromAgent: thisAgentId, toAgent: agentId(domain.name, decision.to!), payload, reason: decision.reason })
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
