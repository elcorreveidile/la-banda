import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { apiUnauthorized } from '@/lib/apiAuth'
import { engine } from '@/engine'
import { kickTick, selfOrigin } from '@/engine/tick'
import { getDomain } from '@domains/index'
import { SECCIONES, getSection } from '@domains/olvidos/secciones'
import { createManuscript, listManuscripts, setVersionSession } from '@/lib/olvidos/manuscripts'

export const dynamic = 'force-dynamic'

/** GET /api/v1/olvidos/manuscritos → manuscritos recientes con su última versión y veredicto. */
export async function GET(req: Request) {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const rows = await listManuscripts(50)
  return NextResponse.json({
    secciones: SECCIONES.map((s) => ({ key: s.key, name: s.name, minWords: s.minWords, maxWords: s.maxWords, minLines: s.minLines ?? null, maxLines: s.maxLines ?? null })),
    manuscritos: rows.map(({ manuscript, version, objections }) => ({
      id: manuscript.id,
      title: manuscript.title,
      byline: manuscript.byline,
      section: manuscript.section,
      sourceName: manuscript.sourceName,
      createdAt: manuscript.createdAt,
      version: { id: version.id, number: version.number, wordCount: version.wordCount, sessionId: version.sessionId, decision: version.decision },
      objections,
    })),
  })
}

const Body = z.object({
  title: z.string().trim().min(1).max(200),
  byline: z.string().trim().max(120).optional().nullable(),
  section: z.string().refine((s) => Boolean(getSection(s)), 'sección desconocida'),
  text: z.string().trim().min(50).max(400_000),
  /** Referencia externa (p. ej. slug o id del artículo en la web de origen). */
  sourceName: z.string().trim().max(200).optional().nullable(),
  createdBy: z.string().trim().max(120).optional(),
})

/**
 * POST /api/v1/olvidos/manuscritos → envía un texto a la redacción.
 * Guarda manuscrito + versión 1, abre la sesión y arranca la cadena de ticks.
 */
export async function POST(req: Request) {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 })
  const b = parsed.data

  const { manuscript, version } = await createManuscript({ title: b.title, byline: b.byline ?? null, section: b.section, format: 'md', sourceName: b.sourceName ?? null, text: b.text, createdBy: b.createdBy ?? 'api' })
  const domain = getDomain('olvidos')
  const opened = await engine.openSession(domain, {
    kind: 'manuscrito',
    createdBy: b.createdBy ?? 'api',
    payload: { manuscriptId: manuscript.id, versionId: version.id, titulo: b.title, firma: b.byline ?? null, seccion: b.section, version: 1, palabras: version.wordCount },
  })
  await setVersionSession(version.id, opened.session.id)

  const origin = selfOrigin(req.url)
  after(async () => {
    try {
      await kickTick(origin, 'olvidos', opened.session.id)
    } catch (err) {
      console.error('[la-banda] kickTick', opened.session.id, err)
    }
  })

  return NextResponse.json({ manuscriptId: manuscript.id, versionId: version.id, sessionId: opened.session.id, wordCount: version.wordCount }, { status: 202 })
}
