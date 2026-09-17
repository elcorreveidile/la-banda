import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { apiUnauthorized } from '@/lib/apiAuth'
import { kickTick, selfOrigin } from '@/engine/tick'
import { CORPUS_DOMAIN, abrirMuestra } from '@/lib/corpus/cycle'
import { NIVELES } from '@domains/corpus-ele/config'

export const dynamic = 'force-dynamic'

const Body = z.object({
  situacion: z.string().trim().min(2).max(120),
  nivel: z.enum(NIVELES),
  tipo: z.enum(['muestra_habla', 'texto_situado', 'transcripcion_oral', 'texto_escrito']).default('muestra_habla'),
  fuente: z.string().trim().max(300).optional().nullable(),
  licencia: z.string().trim().max(120).optional().nullable(),
  notas: z.string().trim().max(1000).optional().nullable(),
  createdBy: z.string().trim().max(120).optional(),
})

/**
 * POST /api/v1/corpus/producir → encarga a La Banda una muestra de habla situada en Granada
 * (cadena A). Abre la sesión y arranca los ticks; Helsinki la registra en la Clínica.
 */
export async function POST(req: Request) {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 })
  const b = parsed.data

  const { session } = await abrirMuestra({ situacion: b.situacion, nivel: b.nivel, tipo: b.tipo, fuente: b.fuente ?? null, licencia: b.licencia ?? null, notas: b.notas ?? null }, b.createdBy ?? 'api')

  const origin = selfOrigin(req.url)
  after(async () => {
    try {
      await kickTick(origin, CORPUS_DOMAIN, session.id)
    } catch (err) {
      console.error('[la-banda] kickTick', session.id, err)
    }
  })

  return NextResponse.json({ sessionId: session.id }, { status: 202 })
}
