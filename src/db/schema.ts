import { pgTable, text, timestamp, jsonb, boolean, serial, integer, primaryKey, uniqueIndex, index } from 'drizzle-orm/pg-core'
import type { AdapterAccountType } from 'next-auth/adapters'

/* ------------------------------------------------------------------ */
/* Motor (sección 3 del brief)                                         */
/* ------------------------------------------------------------------ */

export const agents = pgTable(
  'agents',
  {
    /** `<dominio>:<codename>`; estable entre despliegues. */
    id: text('id').primaryKey(),
    domain: text('domain').notNull(),
    codename: text('codename').notNull(),
    role: text('role').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    tools: jsonb('tools').$type<string[]>().notNull().default([]),
    canVeto: boolean('can_veto').notNull().default(false),
  },
  (t) => [uniqueIndex('agents_domain_codename').on(t.domain, t.codename)],
)

export type SessionStatus = 'open' | 'closed' | 'vetoed' | 'failed'

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  domain: text('domain').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  status: text('status').$type<SessionStatus>().notNull().default('open'),
  finalReport: jsonb('final_report'),
})

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'vetoed' | 'failed'

export const tasks = pgTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').$type<TaskStatus>().notNull().default('pending'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tasks_session').on(t.sessionId)],
)

export type HandoffStatus = 'pending' | 'accepted' | 'returned' | 'vetoed'

export const handoffs = pgTable(
  'handoffs',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    /** Nulo solo en el traspaso semilla que crea el motor al abrir la tarea. */
    fromAgent: text('from_agent').references(() => agents.id),
    toAgent: text('to_agent').notNull().references(() => agents.id),
    payload: jsonb('payload').notNull(),
    status: text('status').$type<HandoffStatus>().notNull().default('pending'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('handoffs_task_status').on(t.taskId, t.status)],
)

export type EventType =
  | 'session_opened'
  | 'handoff_created'
  | 'agent_started'
  | 'pass'
  | 'return'
  | 'veto'
  | 'close'
  | 'transition_rejected'
  | 'agent_error'
  | 'session_failed'

export const events = pgTable(
  'events',
  {
    /** Secuencial: sirve de cursor para el log en vivo. */
    id: serial('id').primaryKey(),
    sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
    /** Firma del agente que produce la acción; nulo en eventos del motor. */
    agentId: text('agent_id').references(() => agents.id),
    type: text('type').$type<EventType>().notNull(),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('events_session_id').on(t.sessionId, t.id)],
)

export type Agent = typeof agents.$inferSelect
export type Session = typeof sessions.$inferSelect
export type Task = typeof tasks.$inferSelect
export type Handoff = typeof handoffs.$inferSelect
export type Event = typeof events.$inferSelect

/* ------------------------------------------------------------------ */
/* Auth.js (prefijo auth_ para no chocar con `sessions` del motor)     */
/* ------------------------------------------------------------------ */

export const authUsers = pgTable('auth_users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
})

export const authAccounts = pgTable(
  'auth_accounts',
  {
    userId: text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
)

export const authSessions = pgTable('auth_sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const authVerificationTokens = pgTable(
  'auth_verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
)
