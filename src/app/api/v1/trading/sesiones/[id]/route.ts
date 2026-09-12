import { NextResponse } from 'next/server'
import { apiUnauthorized } from '@/lib/apiAuth'
import { sessionView } from '@/lib/panel/sessionView'

export const dynamic = 'force-dynamic'

/** GET /api/v1/trading/sesiones/:id → eventos, traspasos y estado de los agentes de una sesión. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const { id } = await params
  const view = await sessionView(id)
  if (!view || view.session.domain !== 'trading') return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(view)
}
