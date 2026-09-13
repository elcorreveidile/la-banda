import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { sessions } from '@/db/schema'
import { apiUnauthorized } from '@/lib/apiAuth'
import { CORPUS_DOMAIN } from '@/lib/corpus/cycle'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/corpus → últimas sesiones del dominio corpus-ele con su informe final
 * (lo consumirá el panel de profesorado de la Clínica en la fase 3).
 * Solo viaja el cierre del Profesor: nunca el texto del alumno ni la traza.
 */
export async function GET(req: Request) {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const recent = await db.select().from(sessions).where(eq(sessions.domain, CORPUS_DOMAIN)).orderBy(desc(sessions.startedAt)).limit(50)
  return NextResponse.json({
    sesiones: recent.map((s) => ({ id: s.id, status: s.status, startedAt: s.startedAt, closedAt: s.closedAt, finalReport: s.finalReport ?? null })),
  })
}
