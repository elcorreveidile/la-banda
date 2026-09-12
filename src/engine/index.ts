import { db } from '@/db'
import { createDbStore } from './dbStore'
import { createEngine } from './orchestrator'
import { runAgentWithAnthropic } from './runAgent'

/** Motor listo para producción: almacén Drizzle/Neon + agentes por la API de Anthropic. */
export const engine = createEngine(createDbStore(db), runAgentWithAnthropic)

export { createEngine } from './orchestrator'
export { createDbStore } from './dbStore'
export type { EngineStore } from './store'
export type { RunAgent, AgentInput } from './runAgent'
