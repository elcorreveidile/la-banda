/**
 * Almacén del dominio marketing. Interfaz para testear con memoria; la real va por Drizzle +
 * neon-http, fila a fila, sin transacciones.
 */

import { and, asc, desc, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm'
import { db } from '@/db'
import { handoffs, sessions, tasks } from '@/db/schema'
import { marketingPiezas, marketingTemas, type EstadoTema, type NuevaPieza, type NuevoTema, type Pieza, type Tema } from '@/db/marketing'
import { MARKETING_DOMAIN } from './config'

export interface SesionAbierta {
  id: string
  kind: string
  payload: Record<string, unknown>
}

export interface MarketingStore {
  tema(id: string): Promise<Tema | null>
  temaPorSesion(sessionId: string): Promise<Tema | null>
  insertarTema(t: NuevoTema): Promise<Tema>
  actualizarTema(id: string, patch: Partial<NuevoTema>): Promise<void>
  /** Temas por estado (todos los destinos si no se da), del más antiguo al más reciente. */
  temasEnEstado(estados: EstadoTema[], destino?: string): Promise<Tema[]>
  /** Temas creados desde `desde` en un destino (cualquier estado). */
  temasDesde(destino: string, desde: Date): Promise<Tema[]>
  /** Títulos de los últimos temas de un destino (para no repetir). */
  titulosRecientes(destino: string, limite: number): Promise<string[]>
  /** Temas con fecha programada en [desde, hasta) y en marcha o ya enviados. */
  programadosEntre(destino: string, desde: Date, hasta: Date): Promise<Tema[]>
  /** Los más recientes para el panel. */
  recientes(limite: number): Promise<Tema[]>
  pieza(externalRef: string): Promise<Pieza | null>
  piezaPorWordnext(wordnextId: string): Promise<Pieza | null>
  insertarPieza(p: NuevaPieza): Promise<Pieza>
  actualizarPieza(id: string, patch: Partial<NuevaPieza>): Promise<void>
  piezasDeTema(temaId: string, version?: number): Promise<Pieza[]>
  /** Sesiones abiertas del dominio marketing con el tipo y la carga de su tarea. */
  sesionesAbiertas(): Promise<SesionAbierta[]>
}

const uno = async <T>(q: Promise<T[]>) => (await q)[0] ?? null
const T = marketingTemas
const P = marketingPiezas
const EN_MARCHA: EstadoTema[] = ['redactando', 'en_revision', 'publicado']

export const marketingStoreDb: MarketingStore = {
  tema: (id) => uno(db.select().from(T).where(eq(T.id, id)).limit(1)),
  temaPorSesion: (sessionId) => uno(db.select().from(T).where(eq(T.sessionId, sessionId)).limit(1)),
  async insertarTema(t) {
    const [row] = await db.insert(T).values(t).returning()
    return row
  },
  async actualizarTema(id, patch) {
    await db.update(T).set({ ...patch, updatedAt: new Date() }).where(eq(T.id, id))
  },
  temasEnEstado: (estados, destino) =>
    db
      .select()
      .from(T)
      .where(and(inArray(T.estado, estados), destino ? eq(T.destino, destino) : undefined))
      .orderBy(asc(T.createdAt))
      .limit(200),
  temasDesde: (destino, desde) => db.select().from(T).where(and(eq(T.destino, destino), gte(T.createdAt, desde))).limit(200),
  async titulosRecientes(destino, limite) {
    const filas = await db.select({ titulo: T.titulo }).from(T).where(eq(T.destino, destino)).orderBy(desc(T.createdAt)).limit(limite)
    return filas.map((f) => f.titulo)
  },
  programadosEntre: (destino, desde, hasta) =>
    db
      .select()
      .from(T)
      .where(and(eq(T.destino, destino), inArray(T.estado, EN_MARCHA), isNotNull(T.programadoPara), gte(T.programadoPara, desde), lt(T.programadoPara, hasta)))
      .limit(50),
  recientes: (limite) => db.select().from(T).orderBy(desc(T.updatedAt)).limit(limite),
  pieza: (externalRef) => uno(db.select().from(P).where(eq(P.externalRef, externalRef)).limit(1)),
  piezaPorWordnext: (wordnextId) => uno(db.select().from(P).where(eq(P.wordnextId, wordnextId)).limit(1)),
  async insertarPieza(p) {
    const [row] = await db.insert(P).values(p).returning()
    return row
  },
  async actualizarPieza(id, patch) {
    await db.update(P).set({ ...patch, updatedAt: new Date() }).where(eq(P.id, id))
  },
  piezasDeTema: (temaId, version) =>
    db
      .select()
      .from(P)
      .where(and(eq(P.temaId, temaId), version !== undefined ? eq(P.version, version) : undefined))
      .orderBy(asc(P.createdAt)),
  async sesionesAbiertas() {
    const filas = await db
      .select({ id: sessions.id, kind: tasks.kind, payload: tasks.payload })
      .from(sessions)
      .innerJoin(tasks, eq(tasks.sessionId, sessions.id))
      .where(and(eq(sessions.domain, MARKETING_DOMAIN), eq(sessions.status, 'open')))
    return filas.map((f) => ({ id: f.id, kind: f.kind, payload: (f.payload ?? {}) as Record<string, unknown> }))
  },
}

/** Carga de la tarea (lo que el motor sembró al abrir la sesión). */
export async function payloadDeTarea(taskId: string): Promise<Record<string, unknown>> {
  const [t] = await db.select({ payload: tasks.payload }).from(tasks).where(eq(tasks.id, taskId)).limit(1)
  return (t?.payload ?? {}) as Record<string, unknown>
}

/** Cargas de los traspasos de la tarea, de la MÁS RECIENTE a la más antigua (el dossier). */
export async function dossierDeTarea(taskId: string): Promise<unknown[]> {
  const hs = await db.select({ payload: handoffs.payload }).from(handoffs).where(eq(handoffs.taskId, taskId)).orderBy(asc(handoffs.createdAt))
  return hs.map((h) => h.payload).reverse()
}

/** Estado e informe final de una sesión. */
export async function leerSesion(id: string): Promise<{ status: string; finalReport: unknown } | null> {
  const [s] = await db.select({ status: sessions.status, finalReport: sessions.finalReport }).from(sessions).where(eq(sessions.id, id)).limit(1)
  return s ?? null
}
