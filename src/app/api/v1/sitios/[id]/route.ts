import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { sessions } from '@/db/schema'
import { apiUnauthorized } from '@/lib/apiAuth'
import { getSite, guardarInformeSitio } from '@/lib/sitios/sites'

export const dynamic = 'force-dynamic'

/** GET /api/v1/sitios/:id → el sitio, su entrega y el cierre del Profesor. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const { id } = await params
  const s = await getSite(id)
  if (!s) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const [ses] = s.sessionId ? await db.select().from(sessions).where(eq(sessions.id, s.sessionId)).limit(1) : []
  // Guarda barata: si la sesión cerró con informe del Profesor y la fila aún no lo tiene, lo persiste (idempotente).
  if (ses?.status === 'closed' && ses.finalReport && !s.informe) await guardarInformeSitio(s.id, ses.finalReport)

  return NextResponse.json({
    id: s.id,
    titulo: s.titulo,
    modo: s.modo,
    alcance: s.alcance,
    tenantId: s.tenantId,
    subdominio: s.subdominio,
    estado: s.estado,
    entrega: s.entrega,
    entregaError: s.entregaError,
    informe: s.informe ?? ses?.finalReport ?? null,
    createdAt: s.createdAt,
    entregadoAt: s.entregadoAt,
    session: ses ? { id: ses.id, status: ses.status, startedAt: ses.startedAt, closedAt: ses.closedAt, finalReport: ses.finalReport } : null,
  })
}
