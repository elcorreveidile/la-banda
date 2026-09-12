import type { ToolDef } from '../types'
import { db } from '@/db'
import { events, handoffs, tasks } from '@/db/schema'
import { asc, eq } from 'drizzle-orm'
import { codenameOf } from '@/engine/store'
import { manuscriptForTask, setVersionDecision, writeObjections, type NewObjection } from '@/lib/olvidos/manuscripts'
import { webSearch } from '@/lib/webSearch'
import { HOJA_DE_ESTILO } from './hojaDeEstilo'
import { SECCIONES, measureAgainstSection } from './secciones'

const MAX_CHARS = 60_000

/** Herramientas del dominio Olvidos. Cada agente solo ve las de su lista. */
export const olvidosTools: Record<string, ToolDef> = {
  readManuscript: {
    name: 'readManuscript',
    description: 'El manuscrito que se evalúa: título, firma, sección, número de versión y texto completo (Markdown o texto plano, párrafos numerados para poder citarlos).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_input, ctx) => {
      const found = await manuscriptForTask(ctx.taskId)
      if (!found) return { error: 'manuscrito no encontrado para esta tarea' }
      const { manuscript, version } = found
      const paragraphs = version.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
      const numbered = paragraphs.map((p, i) => `[¶${i + 1}] ${p}`).join('\n\n')
      return {
        title: manuscript.title,
        byline: manuscript.byline,
        section: manuscript.section,
        version: version.number,
        wordCount: version.wordCount,
        paragraphs: paragraphs.length,
        text: numbered.length > MAX_CHARS ? `${numbered.slice(0, MAX_CHARS)}\n\n[… texto truncado a ${MAX_CHARS} caracteres]` : numbered,
      }
    },
  },

  readStyleSheet: {
    name: 'readStyleSheet',
    description: 'La hoja de estilo de la revista: identidad, condiciones de aceptación, tono y lo que la redacción no hace.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => ({ styleSheet: HOJA_DE_ESTILO }),
  },

  getSectionLimits: {
    name: 'getSectionLimits',
    description: 'Espacio de cada sección (palabras o versos, mínimo y máximo) y la medida del manuscrito frente a su sección.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_input, ctx) => {
      const found = await manuscriptForTask(ctx.taskId)
      const medida = found ? measureAgainstSection(found.version.text, found.manuscript.section) : { error: 'manuscrito no encontrado' }
      return { sections: SECCIONES, manuscript: medida }
    },
  },

  webSearch: {
    name: 'webSearch',
    description: 'Búsqueda web (z.ai) para comprobar datos, nombres, fechas y citas. Como mucho 3 búsquedas; consultas concretas (nombre + obra + año).',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', minLength: 3, maxLength: 200 } },
      required: ['query'],
      additionalProperties: false,
    },
    run: async (input) => webSearch(String(input.query), { recency: 'noLimit', count: 5 }),
  },

  writeLedger: {
    name: 'writeLedger',
    description: 'Registra el informe: la lista numerada de objeciones (agente, gravedad mayor|menor, dónde, texto) y la decisión de Palermo (publicable | con_cambios | rechazado). Llámala una sola vez; sustituye lo registrado antes para esta sesión.',
    inputSchema: {
      type: 'object',
      properties: {
        decision: { type: 'string', enum: ['publicable', 'con_cambios', 'rechazado'] },
        objections: {
          type: 'array',
          maxItems: 60,
          items: {
            type: 'object',
            properties: {
              number: { type: 'integer', minimum: 1 },
              agent: { type: 'string' },
              severity: { type: 'string', enum: ['mayor', 'menor'] },
              location: { type: 'string', maxLength: 200 },
              text: { type: 'string', maxLength: 1000 },
            },
            required: ['number', 'agent', 'severity', 'text'],
            additionalProperties: false,
          },
        },
      },
      required: ['decision', 'objections'],
      additionalProperties: false,
    },
    run: async (input, ctx) => {
      const found = await manuscriptForTask(ctx.taskId)
      if (!found) return { error: 'manuscrito no encontrado para esta tarea' }
      const raw = Array.isArray(input.objections) ? (input.objections as Record<string, unknown>[]) : []
      const list: NewObjection[] = raw.map((o, i) => ({
        number: typeof o.number === 'number' ? o.number : i + 1,
        agent: String(o.agent ?? '?'),
        severity: o.severity === 'mayor' ? 'mayor' : 'menor',
        location: o.location ? String(o.location) : null,
        text: String(o.text ?? ''),
      }))
      const saved = await writeObjections(found.version.id, ctx.sessionId, list)
      await setVersionDecision(found.version.id, String(input.decision))
      return { registered: saved.length, decision: input.decision, versionId: found.version.id }
    },
  },

  readAll: {
    name: 'readAll',
    description: 'La cadena completa de esta sesión: cada traspaso (de quién a quién, estado, motivo, carga) y cada evento en orden. Úsala una vez, al empezar.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_input, ctx) => {
      const hs = await db
        .select({ h: handoffs })
        .from(handoffs)
        .innerJoin(tasks, eq(handoffs.taskId, tasks.id))
        .where(eq(tasks.sessionId, ctx.sessionId))
        .orderBy(asc(handoffs.createdAt))
      const es = await db.select().from(events).where(eq(events.sessionId, ctx.sessionId)).orderBy(asc(events.id))
      return {
        handoffs: hs.map(({ h }) => ({ at: h.createdAt.toISOString(), from: h.fromAgent ? codenameOf(h.fromAgent) : 'motor', to: codenameOf(h.toAgent), status: h.status, reason: h.reason, payload: h.payload })),
        events: es.map((e) => ({ at: e.createdAt.toISOString(), who: e.agentId ? codenameOf(e.agentId) : 'motor', type: e.type, message: e.message })),
      }
    },
  },
}
