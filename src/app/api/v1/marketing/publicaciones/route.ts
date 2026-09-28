import { NextResponse } from 'next/server'
import { apiUnauthorized } from '@/lib/apiAuth'
import { aplicarAviso } from '@/lib/marketing/ciclo'
import { marketingStoreDb } from '@/lib/marketing/store'
import { avisoFirmado, leerVistaPieza } from '@/lib/marketing/wordnext'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/marketing/publicaciones ← WordNext (wp-next-starter, `notifyEmitter`) avisa de cada
 * cambio de estado de una pieza de La Banda: aprobada, publicada, rechazada (con motivo) o
 * retirada. Bearer LA_BANDA_API_KEY + `X-Banda-Signature: sha256=HMAC(WORDNEXT_CALLBACK_SECRET,
 * cuerpo exacto)`. Una pieza que no es nuestra responde 200 (`ignorado`) para que no reintente.
 */
export async function POST(req: Request) {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const cuerpo = await req.text()
  if (cuerpo.length > 64_000) return NextResponse.json({ error: 'cuerpo demasiado grande' }, { status: 413 })
  if (!avisoFirmado(cuerpo, req.headers.get('x-banda-signature'))) return NextResponse.json({ error: 'firma no válida' }, { status: 401 })
  let data: unknown
  try {
    data = JSON.parse(cuerpo)
  } catch {
    return NextResponse.json({ error: 'JSON no válido' }, { status: 400 })
  }
  const vista = leerVistaPieza(data)
  if (!vista) return NextResponse.json({ error: 'aviso sin forma de pieza' }, { status: 400 })
  try {
    const r = await aplicarAviso(vista, { store: marketingStoreDb })
    return NextResponse.json(r.ok ? { ok: true, temaId: r.temaId ?? null, estado: r.estado ?? null } : { ok: true, ignorado: true })
  } catch (err) {
    console.error('[la-banda] aviso marketing', vista.id, err)
    return NextResponse.json({ error: 'no se pudo aplicar el aviso' }, { status: 500 })
  }
}
