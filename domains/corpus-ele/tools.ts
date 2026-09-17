import type { ToolDef } from '../types'
import { db } from '@/db'
import { events, handoffs, tasks } from '@/db/schema'
import { asc, eq } from 'drizzle-orm'
import { codenameOf } from '@/engine/store'
import { webSearch } from '@/lib/webSearch'
import * as clinica from '@/lib/clinica'
import { medirTexto } from '@/lib/corpus/medir'
import { extraerAnotacionesDelDossier, extraerTextoDelDossier, filtrarPorEtiquetario, fusionarAnotaciones, fusionarConTexto, quitarInvalidas, type AnotacionDescartada } from '@/lib/corpus/anotaciones'

const INVENTARIOS = ['funciones', 'generos-discursivos', 'gramatica', 'habilidades-interculturales', 'nociones-especificas', 'nociones-generales', 'ortografia', 'pragmatica', 'procedimientos-aprendizaje', 'pronunciacion', 'referentes-culturales', 'relacion-objetivos', 'saberes-socioculturales']
const NIVELES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const MAX_PCIC_CHARS = 18_000

const anotacionSchema = {
  type: 'object',
  properties: {
    capa: { type: 'string', maxLength: 20 },
    codigo: { type: 'string', maxLength: 80 },
    cita: { type: ['string', 'null'], maxLength: 400 },
    inicio: { type: ['integer', 'null'], minimum: 0 },
    fin: { type: ['integer', 'null'], minimum: 0 },
    nota: { type: ['string', 'null'], maxLength: 1000 },
  },
  required: ['capa', 'codigo'],
  additionalProperties: false,
}

/** Payloads de los traspasos de la tarea, del más reciente al más antiguo (para rescatar anotaciones del dossier). */
async function payloadsDeTarea(taskId: string): Promise<unknown[]> {
  try {
    const hs = await db.select({ payload: handoffs.payload }).from(handoffs).where(eq(handoffs.taskId, taskId)).orderBy(asc(handoffs.createdAt))
    return hs.map((h) => h.payload).reverse()
  } catch (err) {
    console.error('[la-banda] payloadsDeTarea', taskId, err)
    return []
  }
}

/**
 * Prepara las anotaciones para la Clínica: normaliza (sin prefijo de capa), fusiona con
 * las que viajan en el dossier (si se pide) y descarta las que no están en el etiquetario.
 * Si el etiquetario no se puede leer, no filtra: la Clínica dirá cuáles sobran (400).
 */
async function prepararAnotaciones(input: unknown, opciones: { payloads?: unknown[]; texto?: string; max: number }): Promise<{ anotaciones: clinica.AnotacionCorpus[]; descartadas: AnotacionDescartada[] }> {
  const listas: unknown[][] = [Array.isArray(input) ? (input as unknown[]) : []]
  if (opciones.payloads) listas.push(...extraerAnotacionesDelDossier(opciones.payloads))
  // Con texto, el span se calcula buscando la "cita" (fragmento exacto) en el texto: robusto
  // frente a offsets mal calculados por el agente. Sin texto, se respeta inicio/fin.
  const fus = opciones.texto
    ? fusionarConTexto(listas, opciones.texto, opciones.max)
    : { anotaciones: fusionarAnotaciones(listas, opciones.max), descartadas: [] as AnotacionDescartada[] }
  const et = await clinica.etiquetario()
  if (clinica.esError(et)) return { anotaciones: fus.anotaciones, descartadas: fus.descartadas }
  const f = filtrarPorEtiquetario(fus.anotaciones, et)
  return { anotaciones: f.validas, descartadas: [...fus.descartadas, ...f.descartadas] }
}

/** `invalidas` del cuerpo de un 400 de la Clínica, si lo hay. */
function invalidasDe(r: { error: string; detalle?: unknown }): unknown[] | null {
  const d = r.detalle as { invalidas?: unknown } | undefined
  return Array.isArray(d?.invalidas) && d.invalidas.length ? d.invalidas : null
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
    description: 'Registra la muestra en la Clínica (estado validada o borrador; nunca pública: publicar es humano). Llámala UNA vez con la ficha de Nairobi. Fusiona sola las anotaciones de Berlín y Lisboa del dossier y descarta los códigos que no están en el etiquetario (los devuelve en "descartadas"). Si la muestra se queda con 0 anotaciones, la registra como borrador aunque pidas validada ("forzadoBorrador": true).',
    inputSchema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['muestra_habla', 'texto_situado', 'transcripcion_oral', 'texto_escrito'] },
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
      // Fusiona lo que manda Helsinki con lo que dejaron Berlín y Lisboa en el dossier y
      // quita lo que no está en el etiquetario: una pieza no debe quedarse sin anotaciones
      // porque un agente escribió un código con prefijo o Nairobi perdió un array.
      const payloads = await payloadsDeTarea(ctx.taskId)
      // El texto es el borrador de Río tal como viaja en el dossier (versión más reciente), no lo
      // que Helsinki escriba: en la muestra B2 «piso» la ficha llegó con texto null y Helsinki
      // rellenó algo para pasar el esquema. Si el dossier no lo tiene, vale lo de Helsinki.
      const delDossier = extraerTextoDelDossier(payloads)
      const texto = delDossier?.texto ?? String(input.texto)
      const prep = await prepararAnotaciones(input.anotaciones, { payloads, texto, max: 60 })
      const base: Omit<clinica.NuevaPieza, 'anotaciones'> = {
        tipo: input.tipo as clinica.NuevaPieza['tipo'],
        titulo: String(input.titulo),
        texto,
        nivel: String(input.nivel),
        situacion: (input.situacion as string | null | undefined) ?? null,
        procedencia: input.procedencia as clinica.NuevaPieza['procedencia'],
        fuente: (input.fuente as string | null | undefined) ?? null,
        licencia: (input.licencia as string | null | undefined) ?? null,
        fenomenos: Array.isArray(input.fenomenos) ? (input.fenomenos as string[]) : [],
        estado: input.estado === 'borrador' ? 'borrador' : 'validada',
        bandaSessionId: ctx.sessionId,
      }
      let anotaciones = prep.anotaciones
      const descartadas = [...prep.descartadas]
      // Guarda de credibilidad (espejo de la de la Clínica): una muestra sin ni una anotación
      // NO puede quedar "validada", diga lo que diga Helsinki. Se fuerza "borrador" de forma
      // determinista, contando las anotaciones que finalmente entran (tras el reintento).
      const estadoSeguro = () => (anotaciones.length === 0 ? 'borrador' : base.estado)
      let r = await clinica.crearPieza({ ...base, estado: estadoSeguro(), anotaciones })
      if (clinica.esError(r)) {
        const invalidas = invalidasDe(r)
        if (!invalidas) return r
        // 400 por códigos: reintento UNA vez sin ellos (nunca sin todas).
        const q = quitarInvalidas(anotaciones, invalidas)
        anotaciones = q.validas
        descartadas.push(...q.descartadas)
        r = await clinica.crearPieza({ ...base, estado: estadoSeguro(), anotaciones })
        if (clinica.esError(r)) return r
      }
      const forzadoBorrador = anotaciones.length === 0 && input.estado !== 'borrador'
      return { registrada: true, piezaId: r.pieza.id, estado: r.pieza.estado, anotaciones: anotaciones.length, descartadas, forzadoBorrador, textoOrigen: delDossier?.origen ?? 'helsinki' }
    },
  },

  escribirAnotaciones: {
    name: 'escribirAnotaciones',
    description: 'Envía a la Clínica las objeciones aprobadas por Palermo sobre la producción del alumno (sustituye las anteriores de La Banda). Llámala UNA vez. Descarta sola los códigos que no están en el etiquetario ("descartadas").',
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
      const prep = await prepararAnotaciones(input.anotaciones, { max: 40 })
      const cuerpo = { produccionTipo: 'redaccion' as const, produccionRef: String(input.produccionRef), bandaSessionId: ctx.sessionId }
      let anotaciones = prep.anotaciones
      const descartadas = [...prep.descartadas]
      let r = await clinica.escribirAnotaciones({ ...cuerpo, anotaciones })
      if (clinica.esError(r)) {
        const invalidas = invalidasDe(r)
        if (!invalidas) return r
        const q = quitarInvalidas(anotaciones, invalidas)
        anotaciones = q.validas
        descartadas.push(...q.descartadas)
        r = await clinica.escribirAnotaciones({ ...cuerpo, anotaciones })
        if (clinica.esError(r)) return r
      }
      return { registradas: r.anotaciones, descartadas }
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
