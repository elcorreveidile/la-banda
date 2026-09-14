import type { DomainConfig } from '@domains/types'
import type { Agent, Session, Task, Handoff, Event, EventType, SessionStatus, TaskStatus, HandoffStatus } from '@/db/schema'

/** Identificador estable de un agente: `<dominio>:<codename>`. */
export function agentId(domain: string, codename: string): string {
  return `${domain}:${codename}`
}

export function codenameOf(agentId: string): string {
  const i = agentId.indexOf(':')
  return i === -1 ? agentId : agentId.slice(i + 1)
}

export interface NewEvent {
  sessionId: string
  agentId: string | null
  type: EventType
  message: string
}

/**
 * Lo que el orquestador necesita de la persistencia. Todo fila a fila:
 * el transporte neon-http no soporta transacciones.
 */
export interface EngineStore {
  ensureAgents(domain: DomainConfig): Promise<Agent[]>
  createSession(domain: string): Promise<Session>
  getSession(id: string): Promise<Session | null>
  closeSession(id: string, status: Exclude<SessionStatus, 'open'>, finalReport?: unknown): Promise<Session>
  /** Sesiones abiertas de un dominio, de más antigua a más reciente. */
  openSessions(domain: string): Promise<Session[]>
  /** Sesiones NO abiertas (closed/failed) del dominio cerradas antes de `before`. */
  closedSessionsBefore(domain: string, before: Date): Promise<Session[]>
  /** Borra una sesión con sus tareas, traspasos y eventos (fila a fila; sin transacciones). */
  deleteSession(id: string): Promise<void>
  createTask(input: { sessionId: string; kind: string; payload: unknown; createdBy: string }): Promise<Task>
  updateTaskStatus(id: string, status: TaskStatus): Promise<void>
  createHandoff(input: { taskId: string; fromAgent: string | null; toAgent: string; payload: unknown; reason?: string | null }): Promise<Handoff>
  updateHandoff(id: string, patch: { status: HandoffStatus; reason?: string | null }): Promise<void>
  /** El traspaso pendiente más antiguo de la sesión, con su tarea. */
  nextPendingHandoff(sessionId: string): Promise<{ handoff: Handoff; task: Task } | null>
  /**
   * Reclama un traspaso pendiente para procesarlo (pending → in_progress, claimedAt = now).
   * Atómico en una sola sentencia: si otro tick lo reclamó antes, devuelve false.
   */
  claimHandoff(id: string, now: Date): Promise<boolean>
  /** Devuelve un traspaso a pendiente (tick perdido o error de agente) anotando los intentos consumidos. */
  releaseHandoff(id: string, intentos: number): Promise<void>
  /** El traspaso in_progress de la sesión, si lo hay. */
  inProgressHandoff(sessionId: string): Promise<Handoff | null>
  /** Traspasos in_progress reclamados antes de `before` (el tick que los llevaba murió), con su sesión. */
  staleInProgress(domain: string, before: Date): Promise<{ handoff: Handoff; task: Task; session: Session }[]>
  /** Cuántos traspasos lleva la sesión (cortacircuitos de bucles). */
  countHandoffs(sessionId: string): Promise<number>
  addEvent(event: NewEvent): Promise<Event>
}
