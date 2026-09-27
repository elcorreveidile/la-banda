import type { ToolDef } from '../types'
import { db } from '@/db'
import { events, handoffs } from '@/db/schema'
import { asc, eq } from 'drizzle-orm'
import { codenameOf } from '@/engine/store'
import { siteForTask } from '@/lib/sitios/sites'
import { entregarSitio } from '@/lib/sitios/entrega'
import { webSearch } from '@/lib/webSearch'

const MAX_CHARS = 40_000

/** Herramientas del dominio sitios. Cada agente solo ve las de su lista. */
export const sitiosTools: Record<string, ToolDef> = {
  leerBrief: {
    name: 'leerBrief',
    description: 'El encargo completo: título, modo (wordnext|estatico), alcance (sitio|paginas) y el brief del cliente (párrafos numerados para citarlos como [¶n]).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_input, ctx) => {
      const site = await siteForTask(ctx.taskId)
      if (!site) return { error: 'sitio no encontrado para esta tarea' }
      const parrafos = site.brief
        .split(/\n\s*\n/)
        .map((x) => x.trim())
        .filter(Boolean)
      const numbered = parrafos.map((x, i) => `[¶${i + 1}] ${x}`).join('\n\n')
      return {
        titulo: site.titulo,
        modo: site.modo,
        alcance: site.alcance,
        tenantId: site.tenantId,
        subdominio: site.subdominio,
        parrafos: parrafos.length,
        brief: numbered.length > MAX_CHARS ? `${numbered.slice(0, MAX_CHARS)}\n\n[… brief truncado a ${MAX_CHARS} caracteres]` : numbered,
      }
    },
  },

  webSearch: {
    name: 'webSearch',
    description: 'Búsqueda web (z.ai) para estructuras y referencias del sector del cliente. Nunca inventes datos del cliente a partir de ellas. Como mucho 3 búsquedas.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', minLength: 3, maxLength: 200 } },
      required: ['query'],
      additionalProperties: false,
    },
    run: async (input) => webSearch(String(input.query), { recency: 'noLimit', count: 5 }),
  },

  entregarSitio: {
    name: 'entregarSitio',
    description:
      'Ejecuta la ENTREGA del sitio. NO escribas aquí el contenido: la herramienta lo toma todo del dossier (sitioBorrador de Río) y del encargo, valida en código y entrega (a WordNext por API o como paquete estático). Exige que Palermo haya aprobado. Llámala UNA vez.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_input, ctx) => {
      const r = await entregarSitio(ctx.taskId)
      if (r.error) return { error: r.error, sinAprobacion: r.sinAprobacion ?? false, sinBorrador: r.sinBorrador ?? false }
      return { registro: r.entrega }
    },
  },

  readAll: {
    name: 'readAll',
    description: 'La cadena completa de esta sesión: cada traspaso (de quién a quién, estado, motivo, carga) y cada evento en orden. Úsala una vez, al empezar.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_input, ctx) => {
      const hs = await db.select({ h: handoffs }).from(handoffs).where(eq(handoffs.taskId, ctx.taskId)).orderBy(asc(handoffs.createdAt))
      const es = await db.select().from(events).where(eq(events.sessionId, ctx.sessionId)).orderBy(asc(events.id))
      return {
        handoffs: hs.map(({ h }) => ({ at: h.createdAt.toISOString(), from: h.fromAgent ? codenameOf(h.fromAgent) : 'motor', to: codenameOf(h.toAgent), status: h.status, reason: h.reason, payload: h.payload })),
        events: es.map((e) => ({ at: e.createdAt.toISOString(), who: e.agentId ? codenameOf(e.agentId) : 'motor', type: e.type, message: e.message })),
      }
    },
  },
}
