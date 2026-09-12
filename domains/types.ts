/**
 * Contrato entre el motor y los dominios.
 * El motor no sabe nada del contenido: solo conoce estas formas.
 */

/** Acción que devuelve un agente al terminar su trabajo. */
export type AgentActionKind = 'pass' | 'return' | 'veto' | 'close'

export interface AgentDecision {
  action: AgentActionKind
  /** Codename del destinatario (obligatorio en pass y return). */
  to?: string
  /** Carga que viaja en el traspaso (o informe final en close). */
  payload: unknown
  /** Motivo (obligatorio en return y veto). */
  reason?: string
}

/** Herramienta que el motor pone a disposición de un agente. */
export interface ToolDef {
  name: string
  description: string
  /** JSON Schema de la entrada (objeto). */
  inputSchema: Record<string, unknown>
  /** Implementación. Recibe la entrada validada por el modelo y el contexto de la sesión. */
  run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>
}

export interface ToolContext {
  sessionId: string
  taskId: string
  agentCodename: string
}

export interface AgentConfig {
  codename: string
  role: string
  systemPrompt: string
  /** Nombres de herramientas de `DomainConfig.tools` a las que tiene acceso. */
  tools: string[]
  canVeto: boolean
}

export interface DomainConfig {
  /** Identificador estable (clave de `agents.domain` y `sessions.domain`). */
  name: string
  description: string
  agents: AgentConfig[]
  /** Codename del agente que recibe la primera tarea. */
  entry: string
  /** Codename del agente autorizado a cerrar la sesión (acción `close`). */
  closer: string
  /** Grafo de traspasos hacia delante: codename → codenames a los que puede pasar. */
  transitions: Record<string, string[]>
  /** Devoluciones permitidas: codename → codenames a los que puede devolver. */
  returns: Record<string, string[]>
  /** Registro de herramientas del dominio. */
  tools: Record<string, ToolDef>
  /** Tipos de tarea que acepta el dominio (informativo, para el panel). */
  taskKinds: string[]
  /** Tope de pasos por sesión (cortacircuitos contra bucles de devolución). */
  maxSteps: number
}

/** Comprueba la coherencia interna de una configuración de dominio. Lanza si algo no cuadra. */
export function validateDomain(domain: DomainConfig): void {
  const names = new Set(domain.agents.map((a) => a.codename))
  if (names.size !== domain.agents.length) throw new Error(`[${domain.name}] codenames repetidos`)
  const known = (c: string, where: string) => {
    if (!names.has(c)) throw new Error(`[${domain.name}] ${where}: agente desconocido "${c}"`)
  }
  known(domain.entry, 'entry')
  known(domain.closer, 'closer')
  for (const [from, tos] of Object.entries(domain.transitions)) {
    known(from, 'transitions')
    tos.forEach((t) => known(t, `transitions[${from}]`))
  }
  for (const [from, tos] of Object.entries(domain.returns)) {
    known(from, 'returns')
    tos.forEach((t) => known(t, `returns[${from}]`))
  }
  for (const a of domain.agents) {
    for (const t of a.tools) {
      if (!domain.tools[t]) throw new Error(`[${domain.name}] ${a.codename}: herramienta desconocida "${t}"`)
    }
  }
  if (domain.maxSteps < 1) throw new Error(`[${domain.name}] maxSteps debe ser >= 1`)
}
