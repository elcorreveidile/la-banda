import type { ToolDef } from '../types'
import { db } from '@/db'
import { events, handoffs } from '@/db/schema'
import { asc, eq } from 'drizzle-orm'
import { codenameOf } from '@/engine/store'
import { getPeticion, guardarInforme, peticionForTask } from '@/lib/peticiones/peticiones'
import { componerInformeDesdeDossier } from '@/lib/peticiones/informe'
import { intentarAviso, type CuerpoAviso } from '@/lib/peticiones/webhook'
import { webSearch } from '@/lib/webSearch'

const MAX_CHARS = 60_000

/** Payloads de los traspasos de la tarea, del más reciente al más antiguo (patrón corpus-ele). */
async function payloadsDeTarea(taskId: string): Promise<unknown[]> {
  try {
    const hs = await db.select({ payload: handoffs.payload }).from(handoffs).where(eq(handoffs.taskId, taskId)).orderBy(asc(handoffs.createdAt))
    return hs.map((h) => h.payload).reverse()
  } catch (err) {
    console.error('[la-banda] payloadsDeTarea', taskId, err)
    return []
  }
}

function informeUrl(id: string): string {
  const base = (process.env.APP_URL ?? '').trim().replace(/\/+$/, '')
  return `${base || ''}/api/v1/peticiones/${id}`
}

/** Herramientas del dominio peticiones. Cada agente solo ve las de su lista. */
export const peticionesTools: Record<string, ToolDef> = {
  leerPeticion: {
    name: 'leerPeticion',
    description: 'La petición que hay que analizar: título, referencia del solicitante y texto completo (párrafos numerados para poder citarlos como [¶n]).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_input, ctx) => {
      const p = await peticionForTask(ctx.taskId)
      if (!p) return { error: 'petición no encontrada para esta tarea' }
      const parrafos = p.texto
        .split(/\n\s*\n/)
        .map((x) => x.trim())
        .filter(Boolean)
      const numbered = parrafos.map((x, i) => `[¶${i + 1}] ${x}`).join('\n\n')
      return {
        titulo: p.titulo,
        referencia: p.referencia,
        parrafos: parrafos.length,
        texto: numbered.length > MAX_CHARS ? `${numbered.slice(0, MAX_CHARS)}\n\n[… texto truncado a ${MAX_CHARS} caracteres]` : numbered,
      }
    },
  },

  webSearch: {
    name: 'webSearch',
    description: 'Búsqueda web (z.ai) para contrastar datos y contexto de la petición. Como mucho 3 búsquedas; consultas concretas.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', minLength: 3, maxLength: 200 } },
      required: ['query'],
      additionalProperties: false,
    },
    run: async (input) => webSearch(String(input.query), { recency: 'noLimit', count: 5 }),
  },

  registrarInforme: {
    name: 'registrarInforme',
    description:
      'Registra el informe de la petición y avisa al solicitante si dejó webhook. NO escribas el informe aquí: la herramienta lo compone sola desde el dossier (borrador de Río, resumen de Nairobi, criterios, verificación y veredicto de Palermo). Llámala UNA vez.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_input, ctx) => {
      const p = await peticionForTask(ctx.taskId)
      if (!p) return { error: 'petición no encontrada para esta tarea' }
      // Idempotencia: si la fila ya tiene informe (reintento de la sesión), no se reescribe ni se reavisa.
      if (p.informe) return { registro: { peticionId: p.id, estado: p.estado, yaRegistrado: true, aviso: { estado: p.avisoEstado, intentos: p.avisoIntentos } } }

      const informe = componerInformeDesdeDossier(await payloadsDeTarea(ctx.taskId), p.titulo)
      if (!informe) return { error: 'el dossier no tiene informeBorrador con cuerpo: sin borrador de Río no se registra informe' }

      await guardarInforme(p.id, informe)
      const actualizada = await getPeticion(p.id)
      let aviso: { estado: string; intentos: number; error?: string } = { estado: actualizada?.avisoEstado ?? 'no_aplica', intentos: actualizada?.avisoIntentos ?? 0 }
      if (actualizada?.webhookUrl) {
        const cuerpo: CuerpoAviso = {
          evento: 'informe',
          peticionId: actualizada.id,
          referencia: actualizada.referencia,
          titulo: actualizada.titulo,
          sessionId: actualizada.sessionId,
          estado: 'completada',
          informe,
          informeUrl: informeUrl(actualizada.id),
          fecha: new Date().toISOString(),
        }
        const r = await intentarAviso(actualizada, cuerpo)
        aviso = { estado: r.ok ? 'enviado' : 'pendiente', intentos: actualizada.avisoIntentos + 1, error: r.error }
      }
      return { registro: { peticionId: actualizada?.id ?? p.id, estado: 'completada', aviso } }
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
        .where(eq(handoffs.taskId, ctx.taskId))
        .orderBy(asc(handoffs.createdAt))
      const es = await db.select().from(events).where(eq(events.sessionId, ctx.sessionId)).orderBy(asc(events.id))
      return {
        handoffs: hs.map(({ h }) => ({ at: h.createdAt.toISOString(), from: h.fromAgent ? codenameOf(h.fromAgent) : 'motor', to: codenameOf(h.toAgent), status: h.status, reason: h.reason, payload: h.payload })),
        events: es.map((e) => ({ at: e.createdAt.toISOString(), who: e.agentId ? codenameOf(e.agentId) : 'motor', type: e.type, message: e.message })),
      }
    },
  },
}
