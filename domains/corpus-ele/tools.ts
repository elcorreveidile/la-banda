import type { ToolDef } from '../types'
import { db } from '@/db'
import { events, handoffs, tasks } from '@/db/schema'
import { asc, eq } from 'drizzle-orm'
import { codenameOf } from '@/engine/store'
import { webSearch } from '@/lib/webSearch'
import * as clinica from '@/lib/clinica'
import { medirTexto } from '@/lib/corpus/medir'

const INVENTARIOS = ['funciones', 'generos-discursivos', 'gramatica', 'habilidades-interculturales', 'nociones-especificas', 'nociones-generales', 'ortografia', 'pragmatica', 'procedimientos-aprendizaje', 'pronunciacion', 'referentes-culturales', 'relacion-objetivos', 'saberes-socioculturales']
const NIVELES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const MAX_PCIC_CHARS = 18_000

const anotacionSchema = {
  type: 'object',
  properties: {
    capa: { type: 'string', maxLength: 20 },
    codigo: { type: 'string', maxLength: 80 },
    inicio: { type: ['integer', 'null'], minimum: 0 },
    fin: { type: ['integer', 'null'], minimum: 0 },
    nota: { type: ['string', 'null'], maxLength: 1000 },
  },
  required: ['capa', 'codigo'],
  additionalProperties: false,
}

/** Herramientas del dominio corpus-ele. Cada agente solo ve las de su lista. Todas devuelven { error } en vez de lanzar. */
export const corpusTools: Record<string, ToolDef> = {
  leerEtiquetario: {
    name: 'leerEtiquetario',
    description: 'El etiquetario CERRADO del corpus (capas nivel, funcion, gramatica, lexico, pragmatica, cultura, fonetica, error) con su versión. Solo se puede anotar con estos códigos. Opcionalmente filtra por capa.',
    inputSchema: { type: 'object', properties: { capa: { type: 'string', maxLength: 20 } }, additionalProperties: false },
    run: async (input) => {
      const r = await clinica.etiquetario()
      if (clinica.esError(r)) return r
      const capa = typeof input.capa === 'string' ? input.capa : null
      return { version: r.version, capas: r.capas, etiquetas: capa ? r.etiquetas.filter((e) => e.capa === capa) : r.etiquetas }
    },
  },

  leerPcic: {
    name: 'leerPcic',
    description: `Chuleta destilada de un inventario del Plan Curricular del Instituto Cervantes (${INVENTARIOS.join(', ')}). Consúltala ANTES de escribir o anotar.`,
    inputSchema: { type: 'object', properties: { inventario: { type: 'string', enum: INVENTARIOS } }, required: ['inventario'], additionalProperties: false },
    run: async (input) => {
      const inv = String(input.inventario ?? '')
      if (!INVENTARIOS.includes(inv)) return { error: `inventario desconocido: ${inv}` }
      const r = await clinica.pcic(inv)
      if (clinica.esError(r)) return r
      const md = r.markdown.length > MAX_PCIC_CHARS ? `${r.markdown.slice(0, MAX_PCIC_CHARS)}\n\n[… recortado a ${MAX_PCIC_CHARS} caracteres]` : r.markdown
      return { inventario: r.inventario, markdown: md }
    },
  },

  buscarPiezas: {
    name: 'buscarPiezas',
    description: 'Busca piezas del corpus de referencia en la Clínica por nivel, situación o texto (para no repetir y para comparar).',
    inputSchema: {
      type: 'object',
      properties: {
        nivel: { type: 'string', enum: NIVELES },
        situacion: { type: 'string', maxLength: 80 },
        q: { type: 'string', maxLength: 120 },
        take: { type: 'integer', minimum: 1, maximum: 10 },
      },
      additionalProperties: false,
    },
    run: async (input) => {
      const r = await clinica.buscarPiezas({ nivel: input.nivel as string | undefined, situacion: input.situacion as string | undefined, q: input.q as string | undefined, take: (input.take as number | undefined) ?? 5 })
      if (clinica.esError(r)) return r
      return { piezas: r.piezas.map((p) => ({ id: p.id, titulo: p.titulo, nivel: p.nivel, situacion: p.situacion, procedencia: p.procedencia, estado: p.estado, texto: p.texto.length > 1200 ? `${p.texto.slice(0, 1200)}…` : p.texto })) }
    },
  },

  medirNivel: {
    name: 'medirNivel',
    description: 'Medidas objetivas de un texto (palabras, frases, riqueza léxica, marcas de subjuntivo/pasados/conectores/condicional y banda sugerida A/B/C). Solo pistas, no un veredicto.',
    inputSchema: { type: 'object', properties: { texto: { type: 'string', minLength: 1, maxLength: 20000 } }, required: ['texto'], additionalProperties: false },
    run: async (input) => medirTexto(String(input.texto ?? '')),
  },

  webSearch: {
    name: 'webSearch',
    description: 'Búsqueda web (z.ai) para documentar hechos de Granada (lugares, horarios, trámites, costumbres). Como mucho 3 búsquedas; consultas concretas.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 3, maxLength: 200 } }, required: ['query'], additionalProperties: false },
    run: async (input) => webSearch(String(input.query), { recency: 'noLimit', count: 5 }),
  },

  escribirPieza: {
    name: 'escribirPieza',
    description: 'Registra la muestra en la Clínica (estado validada o borrador; nunca pública: publicar es humano). Llámala UNA vez con la ficha de Nairobi.',
    inputSchema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['muestra_habla', 'texto_situado', 'transcripcion_oral'] },
        titulo: { type: 'string', minLength: 3, maxLength: 200 },
        texto: { type: 'string', minLength: 20, maxLength: 20000 },
        nivel: { type: 'string', enum: NIVELES },
        situacion: { type: ['string', 'null'], maxLength: 80 },
        procedencia: { type: 'string', enum: ['autentica', 'adaptada', 'generada'] },
        fuente: { type: ['string', 'null'], maxLength: 500 },
        licencia: { type: ['string', 'null'], maxLength: 120 },
        fenomenos: { type: 'array', items: { type: 'string', maxLength: 80 }, maxItems: 50 },
        estado: { type: 'string', enum: ['borrador', 'validada'] },
        anotaciones: { type: 'array', items: anotacionSchema, maxItems: 60 },
      },
      required: ['tipo', 'titulo', 'texto', 'nivel', 'procedencia', 'estado'],
      additionalProperties: false,
    },
    run: async (input, ctx) => {
      const r = await clinica.crearPieza({
        tipo: input.tipo as clinica.NuevaPieza['tipo'],
        titulo: String(input.titulo),
        texto: String(input.texto),
        nivel: String(input.nivel),
        situacion: (input.situacion as string | null | undefined) ?? null,
        procedencia: input.procedencia as clinica.NuevaPieza['procedencia'],
        fuente: (input.fuente as string | null | undefined) ?? null,
        licencia: (input.licencia as string | null | undefined) ?? null,
        fenomenos: Array.isArray(input.fenomenos) ? (input.fenomenos as string[]) : [],
        estado: input.estado === 'borrador' ? 'borrador' : 'validada',
        bandaSessionId: ctx.sessionId,
        anotaciones: Array.isArray(input.anotaciones) ? (input.anotaciones as clinica.AnotacionCorpus[]) : [],
      })
      if (clinica.esError(r)) return r
      return { registrada: true, piezaId: r.pieza.id, estado: r.pieza.estado }
    },
  },

  escribirAnotaciones: {
    name: 'escribirAnotaciones',
    description: 'Envía a la Clínica las objeciones aprobadas por Palermo sobre la producción del alumno (sustituye las anteriores de La Banda). Llámala UNA vez.',
    inputSchema: {
      type: 'object',
      properties: {
        produccionRef: { type: 'string', minLength: 10, maxLength: 80 },
        anotaciones: { type: 'array', items: anotacionSchema, maxItems: 40 },
      },
      required: ['produccionRef', 'anotaciones'],
      additionalProperties: false,
    },
    run: async (input, ctx) => {
      const r = await clinica.escribirAnotaciones({
        produccionTipo: 'redaccion',
        produccionRef: String(input.produccionRef),
        bandaSessionId: ctx.sessionId,
        anotaciones: Array.isArray(input.anotaciones) ? (input.anotaciones as clinica.AnotacionCorpus[]) : [],
      })
      if (clinica.esError(r)) return r
      return { registradas: r.anotaciones }
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
