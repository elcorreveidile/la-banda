import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { apiUnauthorized } from '@/lib/apiAuth'
import { engine } from '@/engine'
import { kickTick, selfOrigin } from '@/engine/tick'
import { getDomain } from '@domains/index'
import { createSite, listSites, setSiteSesion } from '@/lib/sitios/sites'

export const dynamic = 'force-dynamic'

/** GET /api/v1/sitios → sitios recientes con estado y entrega. */
export async function GET(req: Request) {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const rows = await listSites(50)
  return NextResponse.json({
    sitios: rows.map((s) => ({
      id: s.id,
      titulo: s.titulo,
      modo: s.modo,
      alcance: s.alcance,
      estado: s.estado,
      entrega: s.entrega,
      entregaError: s.entregaError,
      sessionId: s.sessionId,
      createdAt: s.createdAt,
      entregadoAt: s.entregadoAt,
    })),
  })
}

const SUBDOMINIO = /^[a-z0-9]+(-[a-z0-9]+)*$/

const Body = z
  .object({
    titulo: z.string().trim().min(1).max(200),
    modo: z.enum(['wordnext', 'estatico']),
    alcance: z.enum(['sitio', 'paginas']),
    brief: z.string().trim().min(10).max(40_000),
    /** Tenant WordNext existente; obligatorio si alcance = paginas. */
    tenantId: z.string().trim().max(120).optional().nullable(),
    /** Subdominio deseado (x.wordnext.tech); solo si alcance = sitio. */
    subdominio: z
      .string()
      .trim()
      .toLowerCase()
      .max(63)
      .regex(SUBDOMINIO, 'subdominio: minúsculas, números y guiones')
      .optional()
      .nullable(),
    createdBy: z.string().trim().max(120).optional(),
  })
  .superRefine((b, ctx) => {
    if (b.alcance === 'paginas' && !b.tenantId) ctx.addIssue({ code: 'custom', message: 'alcance paginas exige tenantId', path: ['tenantId'] })
    if (b.alcance === 'sitio' && b.tenantId) ctx.addIssue({ code: 'custom', message: 'tenantId va solo con alcance paginas', path: ['tenantId'] })
    if (b.alcance === 'paginas' && b.subdominio) ctx.addIssue({ code: 'custom', message: 'subdominio va solo con alcance sitio', path: ['subdominio'] })
  })

/**
 * POST /api/v1/sitios → encarga un sitio a la banda.
 * Guarda la fila, abre la sesión y arranca la cadena de ticks. El brief NO viaja en el
 * payload de la tarea (dossier ligero): lo lee la herramienta leerBrief.
 */
export async function POST(req: Request) {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 })
  const b = parsed.data

  const site = await createSite({
    titulo: b.titulo,
    modo: b.modo,
    alcance: b.alcance,
    brief: b.brief,
    tenantId: b.tenantId ?? null,
    subdominio: b.subdominio ?? null,
    createdBy: b.createdBy ?? 'api',
  })
  const domain = getDomain('sitios')
  const opened = await engine.openSession(domain, {
    kind: 'sitio',
    createdBy: b.createdBy ?? 'api',
    payload: { kind: 'sitio', sitioId: site.id, titulo: site.titulo, modo: site.modo, alcance: site.alcance },
  })
  await setSiteSesion(site.id, opened.session.id)

  const origin = selfOrigin(req.url)
  after(async () => {
    try {
      await kickTick(origin, 'sitios', opened.session.id)
    } catch (err) {
      console.error('[la-banda] kickTick', opened.session.id, err)
    }
  })

  return NextResponse.json({ sitioId: site.id, sessionId: opened.session.id }, { status: 202 })
}
