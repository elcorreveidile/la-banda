import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { sessions } from '@/db/schema'
import { apiUnauthorized } from '@/lib/apiAuth'
import { getPeticion } from '@/lib/peticiones/peticiones'

export const dynamic = 'force-dynamic'

/** GET /api/v1/peticiones/:id → la petición, su informe y el estado del aviso. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const { id } = await params
  const p = await getPeticion(id)
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const [s] = p.sessionId ? await db.select().from(sessions).where(eq(sessions.id, p.sessionId)).limit(1) : []
  return NextResponse.json({
    id: p.id,
    titulo: p.titulo,
    referencia: p.referencia,
    estado: p.estado,
    createdAt: p.createdAt,
    completadaAt: p.completadaAt,
    informe: p.informe,
    aviso: { estado: p.avisoEstado, intentos: p.avisoIntentos, ultimoAt: p.avisoUltimoAt, ultimoError: p.avisoUltimoError },
    session: s ? { id: s.id, status: s.status, startedAt: s.startedAt, closedAt: s.closedAt, finalReport: s.finalReport } : null,
  })
}
