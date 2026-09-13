import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { apiUnauthorized } from '@/lib/apiAuth'
import { kickTick, selfOrigin } from '@/engine/tick'
import { CORPUS_DOMAIN, abrirProduccion } from '@/lib/corpus/cycle'
import { NIVELES } from '@domains/corpus-ele/config'

export const dynamic = 'force-dynamic'

const Body = z.object({
  /** Referencia de la producción en la Clínica (uuid de la redacción). */
  ref: z.string().uuid(),
  /** Seudónimo del alumno (p-xxxxxxxxxx): nunca su nombre ni su correo. */
  seudonimo: z.string().trim().min(3).max(40),
  texto: z.string().trim().min(20).max(60_000),
  nivel: z.enum(NIVELES).optional().nullable(),
  consigna: z.string().trim().max(1000).optional().nullable(),
  lenguaMaterna: z.string().trim().max(60).optional().nullable(),
  origen: z.string().trim().max(60).default('redaccion'),
  createdBy: z.string().trim().max(120).optional(),
})

/**
 * POST /api/v1/corpus/anotar → una producción seudonimizada de un alumno con consentimiento
 * (cadena B). Los agentes señalan, no corrigen; Helsinki escribe las anotaciones en la Clínica.
 */
export async function POST(req: Request) {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 })
  const b = parsed.data

  const { session } = await abrirProduccion(
    { ref: b.ref, seudonimo: b.seudonimo, texto: b.texto, nivel: b.nivel ?? null, consigna: b.consigna ?? null, lenguaMaterna: b.lenguaMaterna ?? null, origen: b.origen },
    b.createdBy ?? 'api',
  )

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
