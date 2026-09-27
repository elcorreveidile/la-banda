import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { apiUnauthorized } from '@/lib/apiAuth'
import { engine } from '@/engine'
import { kickTick, selfOrigin } from '@/engine/tick'
import { getDomain } from '@domains/index'
import { createPeticion, listPeticiones, setPeticionSesion } from '@/lib/peticiones/peticiones'

export const dynamic = 'force-dynamic'

/** GET /api/v1/peticiones → peticiones recientes con estado y aviso. */
export async function GET(req: Request) {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const rows = await listPeticiones(50)
  return NextResponse.json({
    peticiones: rows.map((p) => ({
      id: p.id,
      titulo: p.titulo,
      referencia: p.referencia,
      estado: p.estado,
      aviso: { estado: p.avisoEstado, intentos: p.avisoIntentos },
      sessionId: p.sessionId,
      createdAt: p.createdAt,
      completadaAt: p.completadaAt,
    })),
  })
}

const webhookUrlSchema = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine((u) => u.startsWith('https://') || process.env.NODE_ENV !== 'production', 'la webhook debe ser https en producción')

const Body = z.object({
  titulo: z.string().trim().min(1).max(200),
  texto: z.string().trim().min(10).max(20_000),
  webhookUrl: webhookUrlSchema.optional().nullable(),
  /** Referencia externa del solicitante; viaja de vuelta en el webhook. */
  referencia: z.string().trim().max(200).optional().nullable(),
  createdBy: z.string().trim().max(120).optional(),
})

/**
 * POST /api/v1/peticiones → envía una petición libre a la banda.
 * Guarda la fila, abre la sesión y arranca la cadena de ticks. El texto NO viaja en el
 * payload de la tarea (dossier ligero): lo lee la herramienta leerPeticion.
 */
export async function POST(req: Request) {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 })
  const b = parsed.data

  const peticion = await createPeticion({ titulo: b.titulo, texto: b.texto, webhookUrl: b.webhookUrl ?? null, referencia: b.referencia ?? null, createdBy: b.createdBy ?? 'api' })
  const domain = getDomain('peticiones')
  const opened = await engine.openSession(domain, {
    kind: 'peticion',
    createdBy: b.createdBy ?? 'api',
    payload: { kind: 'peticion', peticionId: peticion.id, titulo: peticion.titulo },
  })
  await setPeticionSesion(peticion.id, opened.session.id)

  const origin = selfOrigin(req.url)
  after(async () => {
    try {
      await kickTick(origin, 'peticiones', opened.session.id)
    } catch (err) {
      console.error('[la-banda] kickTick', opened.session.id, err)
    }
  })

  return NextResponse.json({ peticionId: peticion.id, sessionId: opened.session.id }, { status: 202 })
}
