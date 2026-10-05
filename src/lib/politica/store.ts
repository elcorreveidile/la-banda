/**
 * Almacén del dominio política. Interfaz para testear con memoria; la real va por Drizzle +
 * neon-http, fila a fila, sin transacciones. El índice único de `external_ref` es el cerrojo que
 * impide abrir dos veces la misma edición.
 */

import { and, desc, eq, ne } from 'drizzle-orm'
import { db } from '@/db'
import { sessions, tasks } from '@/db/schema'
import { politicaPiezas, type NuevaPiezaPolitica, type PiezaPolitica } from '@/db/politica'
import { POLITICA_DOMAIN } from './config'

export interface SesionAbiertaPolitica {
  id: string
  kind: string
  payload: Record<string, unknown>
}

export interface PoliticaStore {
  pieza(id: string): Promise<PiezaPolitica | null>
  piezaPorRef(ref: string): Promise<PiezaPolitica | null>
  piezaPorSesion(sessionId: string): Promise<PiezaPolitica | null>
  piezaPorRemoto(remotoId: string): Promise<PiezaPolitica | null>
  /** Inserta; devuelve null si ya existe una con ese `externalRef` (cerrojo). */
  insertar(p: NuevaPiezaPolitica): Promise<PiezaPolitica | null>
  actualizar(id: string, patch: Partial<NuevaPiezaPolitica>): Promise<void>
  delDia(dia: string): Promise<PiezaPolitica[]>
  recientes(limite: number, conArchivadas?: boolean): Promise<PiezaPolitica[]>
  sesionesAbiertas(): Promise<SesionAbiertaPolitica[]>
}

export const esDuplicado = (err: unknown): boolean => {
  const e = err as { code?: string; message?: string; cause?: { code?: string } }
  return e?.code === '23505' || e?.cause?.code === '23505' || /duplicate key|unique constraint/i.test(e?.message ?? '')
}

const uno = async <T>(q: Promise<T[]>) => (await q)[0] ?? null
const P = politicaPiezas

export const politicaStoreDb: PoliticaStore = {
  pieza: (id) => uno(db.select().from(P).where(eq(P.id, id)).limit(1)),
  piezaPorRef: (ref) => uno(db.select().from(P).where(eq(P.externalRef, ref)).limit(1)),
  piezaPorSesion: (sessionId) => uno(db.select().from(P).where(eq(P.sessionId, sessionId)).limit(1)),
  piezaPorRemoto: (remotoId) => uno(db.select().from(P).where(eq(P.remotoId, remotoId)).limit(1)),
  async insertar(p) {
    try {
      const [row] = await db.insert(P).values(p).returning()
      return row
    } catch (err) {
      if (esDuplicado(err)) return null
      throw err
    }
  },
  async actualizar(id, patch) {
    await db.update(P).set({ ...patch, updatedAt: new Date() }).where(eq(P.id, id))
  },
  delDia: (dia) => db.select().from(P).where(eq(P.dia, dia)).limit(100),
  recientes: (limite, conArchivadas = false) =>
    db.select().from(P).where(conArchivadas ? undefined : ne(P.estado, 'archivada')).orderBy(desc(P.updatedAt)).limit(limite),
  async sesionesAbiertas() {
    const filas = await db
      .select({ id: sessions.id, kind: tasks.kind, payload: tasks.payload })
      .from(sessions)
      .innerJoin(tasks, eq(tasks.sessionId, sessions.id))
      .where(and(eq(sessions.domain, POLITICA_DOMAIN), eq(sessions.status, 'open')))
    return filas.map((f) => ({ id: f.id, kind: f.kind, payload: (f.payload ?? {}) as Record<string, unknown> }))
  },
}

export { dossierDeTarea, leerSesion, payloadDeTarea } from '@/lib/marketing/store'
