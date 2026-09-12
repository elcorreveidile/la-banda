import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { tasks } from '@/db/schema'
import { manuscripts, objections, versions, type Manuscript, type ManuscriptFormat, type Objection, type Version } from '@/db/olvidos'
import { countWords } from '@domains/olvidos/secciones'

const uuid = () => crypto.randomUUID()

/** Convierte un fichero subido (.md, .txt o .docx) a texto plano/Markdown. */
export async function fileToText(file: File): Promise<{ text: string; format: ManuscriptFormat }> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth')
    const buffer = Buffer.from(await file.arrayBuffer())
    const { value } = await mammoth.extractRawText({ buffer })
    return { text: value.replace(/\n{3,}/g, '\n\n').trim(), format: 'docx' }
  }
  const text = (await file.text()).trim()
  return { text, format: name.endsWith('.md') ? 'md' : 'txt' }
}

export async function createManuscript(input: { title: string; byline: string | null; section: string; format: ManuscriptFormat; sourceName: string | null; text: string; createdBy: string }): Promise<{ manuscript: Manuscript; version: Version }> {
  const [manuscript] = await db
    .insert(manuscripts)
    .values({ id: uuid(), title: input.title, byline: input.byline, section: input.section, format: input.format, sourceName: input.sourceName, createdBy: input.createdBy })
    .returning()
  const [version] = await db.insert(versions).values({ id: uuid(), manuscriptId: manuscript.id, number: 1, text: input.text, wordCount: countWords(input.text) }).returning()
  return { manuscript, version }
}

/** Nueva versión de un manuscrito existente (reenvío tras objeciones). */
export async function addVersion(manuscriptId: string, text: string): Promise<Version> {
  const [last] = await db.select().from(versions).where(eq(versions.manuscriptId, manuscriptId)).orderBy(desc(versions.number)).limit(1)
  const [v] = await db.insert(versions).values({ id: uuid(), manuscriptId, number: (last?.number ?? 0) + 1, text, wordCount: countWords(text) }).returning()
  return v
}

export async function getManuscript(id: string): Promise<Manuscript | null> {
  const [m] = await db.select().from(manuscripts).where(eq(manuscripts.id, id)).limit(1)
  return m ?? null
}

export async function getVersion(id: string): Promise<Version | null> {
  const [v] = await db.select().from(versions).where(eq(versions.id, id)).limit(1)
  return v ?? null
}

export async function setVersionSession(versionId: string, sessionId: string) {
  await db.update(versions).set({ sessionId }).where(eq(versions.id, versionId))
}

export async function setVersionDecision(versionId: string, decision: string) {
  await db.update(versions).set({ decision }).where(eq(versions.id, versionId))
}

/** El manuscrito y la versión que evalúa una tarea (leídos de su payload). */
export async function manuscriptForTask(taskId: string): Promise<{ manuscript: Manuscript; version: Version } | null> {
  const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  const payload = (t?.payload ?? {}) as { manuscriptId?: string; versionId?: string }
  if (!payload.manuscriptId || !payload.versionId) return null
  const manuscript = await getManuscript(payload.manuscriptId)
  const version = await getVersion(payload.versionId)
  return manuscript && version ? { manuscript, version } : null
}

export interface NewObjection {
  number: number
  agent: string
  severity: 'mayor' | 'menor'
  location: string | null
  text: string
}

/** Sustituye las objeciones de una versión para esta sesión (Helsinki las registra de una vez). */
export async function writeObjections(versionId: string, sessionId: string, list: NewObjection[]): Promise<Objection[]> {
  await db.delete(objections).where(and(eq(objections.versionId, versionId), eq(objections.sessionId, sessionId)))
  if (!list.length) return []
  return db
    .insert(objections)
    .values(list.map((o) => ({ id: uuid(), versionId, sessionId, number: o.number, agent: o.agent, severity: o.severity, location: o.location, text: o.text })))
    .returning()
}

export async function objectionsForSession(sessionId: string): Promise<Objection[]> {
  return db.select().from(objections).where(eq(objections.sessionId, sessionId)).orderBy(asc(objections.number))
}

export interface ManuscriptRow {
  manuscript: Manuscript
  version: Version
  objections: number
}

/** Manuscritos recientes con su última versión. */
export async function listManuscripts(limit = 30): Promise<ManuscriptRow[]> {
  const ms = await db.select().from(manuscripts).orderBy(desc(manuscripts.createdAt)).limit(limit)
  const out: ManuscriptRow[] = []
  for (const m of ms) {
    const [v] = await db.select().from(versions).where(eq(versions.manuscriptId, m.id)).orderBy(desc(versions.number)).limit(1)
    if (!v) continue
    const objs = v.sessionId ? await objectionsForSession(v.sessionId) : []
    out.push({ manuscript: m, version: v, objections: objs.length })
  }
  return out
}
