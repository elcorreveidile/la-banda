import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { sessions } from '@/db/schema'
import { versions } from '@/db/olvidos'
import { apiUnauthorized } from '@/lib/apiAuth'
import { getManuscript, objectionsForSession } from '@/lib/olvidos/manuscripts'

export const dynamic = 'force-dynamic'

/** GET /api/v1/olvidos/manuscritos/:id → el informe: versiones, objeciones numeradas y veredicto. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const { id } = await params
  const manuscript = await getManuscript(id)
  if (!manuscript) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const vs = await db.select().from(versions).where(eq(versions.manuscriptId, id)).orderBy(asc(versions.number))
  const out = []
  for (const v of vs) {
    const [s] = v.sessionId ? await db.select().from(sessions).where(eq(sessions.id, v.sessionId)).limit(1) : []
    const objs = v.sessionId ? await objectionsForSession(v.sessionId) : []
    out.push({
      id: v.id,
      number: v.number,
      wordCount: v.wordCount,
      decision: v.decision,
      createdAt: v.createdAt,
      session: s ? { id: s.id, status: s.status, startedAt: s.startedAt, closedAt: s.closedAt, finalReport: s.finalReport } : null,
      objections: objs.map((o) => ({ number: o.number, agent: o.agent, severity: o.severity, location: o.location, text: o.text })),
    })
  }
  return NextResponse.json({ id: manuscript.id, title: manuscript.title, byline: manuscript.byline, section: manuscript.section, sourceName: manuscript.sourceName, createdAt: manuscript.createdAt, versions: out })
}
