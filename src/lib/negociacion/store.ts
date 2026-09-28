/**
 * Almacén de la red de webs (nodos y negociaciones). Interfaz para testear con memoria
 * (`tests/redMemoryStore.ts`); la real va por Drizzle + neon-http, fila a fila, sin
 * transacciones.
 */

import { and, count, desc, eq, gte, isNotNull } from 'drizzle-orm'
import { db } from '@/db'
import { negociaciones, nodos, type Negociacion, type Nodo, type NuevaNegociacion, type NuevoNodo } from '@/db/negociacion'

export interface FiltroNodos {
  capacidad?: string
  sector?: string
  limite: number
}

export interface RedStore {
  nodo(id: string): Promise<Nodo | null>
  nodoPorTenant(tenantId: string): Promise<Nodo | null>
  insertarNodo(n: NuevoNodo): Promise<Nodo>
  actualizarNodo(id: string, patch: Partial<NuevoNodo>): Promise<void>
  /** Nodos ACTIVOS que cumplen el filtro (capacidad y sector exactos). */
  buscarNodos(f: FiltroNodos): Promise<Nodo[]>
  negociacion(id: string): Promise<Negociacion | null>
  negociacionPorSesion(sessionId: string): Promise<Negociacion | null>
  insertarNegociacion(n: NuevaNegociacion): Promise<Negociacion>
  actualizarNegociacion(id: string, patch: Partial<NuevaNegociacion>): Promise<void>
  /** Negociaciones abiertas por un comprador desde `desde` (tope diario). */
  negociacionesDesde(compradorNodoId: string, desde: Date): Promise<number>
  /** Mesas en curso (estado negociando y con sesión). */
  negociacionesAbiertas(): Promise<Negociacion[]>
  avisosPendientes(): Promise<Negociacion[]>
  /** Propuestas esperando la aprobación humana (para caducarlas). */
  propuestasPendientes(): Promise<Negociacion[]>
}

const uno = async <T>(q: Promise<T[]>) => (await q)[0] ?? null
const nd = nodos
const ng = negociaciones

export const redStoreDb: RedStore = {
  nodo: (id) => uno(db.select().from(nd).where(eq(nd.id, id)).limit(1)),
  nodoPorTenant: (tenantId) => uno(db.select().from(nd).where(eq(nd.tenantId, tenantId)).limit(1)),
  async insertarNodo(n) {
    const [row] = await db.insert(nd).values(n).returning()
    return row
  },
  async actualizarNodo(id, patch) {
    await db.update(nd).set({ ...patch, updatedAt: new Date() }).where(eq(nd.id, id))
  },
  async buscarNodos(f) {
    const filas = await db
      .select()
      .from(nd)
      .where(and(eq(nd.activo, true), f.sector ? eq(nd.sector, f.sector) : undefined))
      .orderBy(desc(nd.updatedAt))
      .limit(500)
    return filas.filter((n) => !f.capacidad || n.capacidades.includes(f.capacidad)).slice(0, f.limite)
  },
  negociacion: (id) => uno(db.select().from(ng).where(eq(ng.id, id)).limit(1)),
  negociacionPorSesion: (sessionId) => uno(db.select().from(ng).where(eq(ng.sessionId, sessionId)).limit(1)),
  async insertarNegociacion(n) {
    const [row] = await db.insert(ng).values(n).returning()
    return row
  },
  async actualizarNegociacion(id, patch) {
    await db.update(ng).set({ ...patch, updatedAt: new Date() }).where(eq(ng.id, id))
  },
  async negociacionesDesde(compradorNodoId, desde) {
    const [c] = await db.select({ n: count() }).from(ng).where(and(eq(ng.compradorNodoId, compradorNodoId), gte(ng.createdAt, desde)))
    return c?.n ?? 0
  },
  negociacionesAbiertas: () => db.select().from(ng).where(and(eq(ng.estado, 'negociando'), isNotNull(ng.sessionId))),
  avisosPendientes: () => db.select().from(ng).where(eq(ng.avisoEstado, 'pendiente')),
  propuestasPendientes: () => db.select().from(ng).where(eq(ng.estado, 'propuesta')),
}
