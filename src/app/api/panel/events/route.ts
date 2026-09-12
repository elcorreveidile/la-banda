import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sessionView } from '@/lib/panel/sessionView'

export const dynamic = 'force-dynamic'

/** GET /api/panel/events?session=<id>&after=<eventId> → eventos nuevos, traspasos y estado de los agentes. */
export async function GET(req: Request) {
  const me = await auth()
  if (!me?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const sessionId = url.searchParams.get('session')
  const after = Number(url.searchParams.get('after') ?? 0)
  if (!sessionId) return NextResponse.json({ error: 'session requerida' }, { status: 400 })

  const view = await sessionView(sessionId, Number.isFinite(after) ? after : 0)
  if (!view) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(view)
}
