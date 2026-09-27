import { and, count, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { events, sessions } from '@/db/schema'
import { peticiones, type Peticion } from '@/db/peticiones'
import { listPeticiones } from './peticiones'

export interface PeticionesMetrics {
  /** Peticiones recientes (para la lista de la tarjeta). */
  recientes: Peticion[]
  sessions: number
  porEstado: { completadas: number; en_curso: number; fallidas: number; vetadas: number }
  avisos: { pendientes: number; agotados: number }
  /** Devoluciones de Lisboa en este dominio. */
  returns: number
}

/** Métricas del dominio peticiones para la tarjeta del panel. */
export async function peticionesMetrics(): Promise<PeticionesMetrics> {
  const recientes = await listPeticiones(30)
  const [s] = await db.select({ n: count() }).from(sessions).where(eq(sessions.domain, 'peticiones'))
  const porEstadoRows = await db
    .select({ estado: peticiones.estado, n: count() })
    .from(peticiones)
    .where(inArray(peticiones.estado, ['completada', 'en_curso', 'fallida', 'vetada']))
    .groupBy(peticiones.estado)
  const porEstado = { completadas: 0, en_curso: 0, fallidas: 0, vetadas: 0 }
  for (const row of porEstadoRows) if (row.estado in porEstado) porEstado[row.estado as keyof typeof porEstado] = Number(row.n)
  const [pend] = await db.select({ n: count() }).from(peticiones).where(eq(peticiones.avisoEstado, 'pendiente'))
  const [agot] = await db.select({ n: count() }).from(peticiones).where(eq(peticiones.avisoEstado, 'agotado'))
  const [r] = await db.select({ n: count() }).from(events).where(and(eq(events.type, 'return'), eq(events.agentId, 'peticiones:Lisboa')))
  return {
    recientes,
    sessions: Number(s?.n ?? 0),
    porEstado,
    avisos: { pendientes: Number(pend?.n ?? 0), agotados: Number(agot?.n ?? 0) },
    returns: Number(r?.n ?? 0),
  }
}
