import { NextResponse } from 'next/server'
import { and, asc, eq, gt } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { events, sessions } from '@/db/schema'
import { codenameOf } from '@/engine/store'

export const dynamic = 'force-dynamic'

/** GET /api/panel/events?session=<id>&after=<eventId> → eventos nuevos + estado de la sesión. */
export async function GET(req: Request) {
  const me = await auth()
  if (!me?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const sessionId = url.searchParams.get('session')
  const after = Number(url.searchParams.get('after') ?? 0)
  if (!sessionId) return NextResponse.json({ error: 'session requerida' }, { status: 400 })

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.sessionId, sessionId), gt(events.id, Number.isFinite(after) ? after : 0)))
    .orderBy(asc(events.id))
    .limit(500)

  return NextResponse.json({
    session: { id: session.id, domain: session.domain, status: session.status, closedAt: session.closedAt, finalReport: session.finalReport },
    events: rows.map((e) => ({
      id: e.id,
      type: e.type,
      message: e.message,
      codename: e.agentId ? codenameOf(e.agentId) : null,
      createdAt: e.createdAt,
    })),
  })
}
