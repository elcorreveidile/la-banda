import { asc, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { tasks } from '@/db/schema'
import { siteFiles, sites, type EntregaSitio, type Site, type SiteFile } from '@/db/sitios'

const uuid = () => crypto.randomUUID()

export interface NuevoSitio {
  titulo: string
  modo: 'wordnext' | 'estatico'
  alcance: 'sitio' | 'paginas'
  brief: string
  tenantId: string | null
  subdominio: string | null
  createdBy: string
}

export async function createSite(input: NuevoSitio): Promise<Site> {
  const [s] = await db.insert(sites).values({ id: uuid(), ...input, estado: 'recibido' }).returning()
  return s
}

export async function getSite(id: string): Promise<Site | null> {
  const [s] = await db.select().from(sites).where(eq(sites.id, id)).limit(1)
  return s ?? null
}

export async function listSites(limit = 30): Promise<Site[]> {
  return db.select().from(sites).orderBy(desc(sites.createdAt)).limit(limit)
}

export async function setSiteSesion(id: string, sessionId: string) {
  await db.update(sites).set({ sessionId }).where(eq(sites.id, id))
}

export async function setEntrega(id: string, entrega: EntregaSitio) {
  await db.update(sites).set({ entrega, estado: 'entregado', entregaError: null, entregadoAt: new Date() }).where(eq(sites.id, id))
}

export async function setErrorEntrega(id: string, error: string) {
  await db.update(sites).set({ entregaError: error, estado: 'error_entrega' }).where(eq(sites.id, id))
}

export async function guardarInformeSitio(id: string, informe: unknown) {
  await db.update(sites).set({ informe }).where(eq(sites.id, id))
}

/** El sitio que construye una tarea (leído de su payload, patrón manuscriptForTask). */
export async function siteForTask(taskId: string): Promise<Site | null> {
  const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  const payload = (t?.payload ?? {}) as { sitioId?: string }
  if (!payload.sitioId) return null
  return getSite(payload.sitioId)
}

/** Sustituye los ficheros del paquete estático del sitio (patrón writeObjections). */
export async function writeFiles(siteId: string, files: { path: string; contenido: string }[]): Promise<SiteFile[]> {
  await db.delete(siteFiles).where(eq(siteFiles.siteId, siteId))
  if (!files.length) return []
  return db
    .insert(siteFiles)
    .values(files.map((f) => ({ id: uuid(), siteId, path: f.path, contenido: f.contenido, bytes: Buffer.byteLength(f.contenido, 'utf8') })))
    .returning()
}

export async function filesForSite(siteId: string): Promise<SiteFile[]> {
  return db.select().from(siteFiles).where(eq(siteFiles.siteId, siteId)).orderBy(asc(siteFiles.path))
}
