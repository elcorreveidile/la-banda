import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { tasks } from '@/db/schema'
import { peticiones, type EstadoPeticion, type Peticion } from '@/db/peticiones'

const uuid = () => crypto.randomUUID()

export interface NuevaPeticion {
  titulo: string
  texto: string
  webhookUrl: string | null
  referencia: string | null
  createdBy: string
}

export async function createPeticion(input: NuevaPeticion): Promise<Peticion> {
  const [p] = await db
    .insert(peticiones)
    .values({
      id: uuid(),
      titulo: input.titulo,
      texto: input.texto,
      webhookUrl: input.webhookUrl,
      referencia: input.referencia,
      estado: 'recibida',
      avisoEstado: 'no_aplica',
      createdBy: input.createdBy,
    })
    .returning()
  return p
}

export async function getPeticion(id: string): Promise<Peticion | null> {
  const [p] = await db.select().from(peticiones).where(eq(peticiones.id, id)).limit(1)
  return p ?? null
}

export async function listPeticiones(limit = 30): Promise<Peticion[]> {
  return db.select().from(peticiones).orderBy(desc(peticiones.createdAt)).limit(limit)
}

export async function setPeticionSesion(id: string, sessionId: string) {
  await db.update(peticiones).set({ sessionId, estado: 'en_curso' }).where(eq(peticiones.id, id))
}

export async function setPeticionEstado(id: string, estado: EstadoPeticion) {
  await db.update(peticiones).set(estado === 'completada' ? { estado, completadaAt: new Date() } : { estado }).where(eq(peticiones.id, id))
}

export async function guardarInforme(id: string, informe: unknown): Promise<Peticion | null> {
  await db.update(peticiones).set({ informe, estado: 'completada', completadaAt: new Date() }).where(eq(peticiones.id, id))
  return getPeticion(id)
}

/** La petición que resuelve una tarea (leído de su payload, patrón manuscriptForTask). */
export async function peticionForTask(taskId: string): Promise<Peticion | null> {
  const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  const payload = (t?.payload ?? {}) as { peticionId?: string }
  if (!payload.peticionId) return null
  return getPeticion(payload.peticionId)
}
