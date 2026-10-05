import { NextResponse } from 'next/server'
import { apiUnauthorized } from '@/lib/apiAuth'
import { leerVistaPieza } from '@/lib/marketing/wordnext'
import { aplicarAviso } from '@/lib/politica/ciclo'
import { avisoFirmado } from '@/lib/politica/cliente'
import { politicaStoreDb } from '@/lib/politica/store'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/politica/publicaciones ← el sondeo de Con-textos 29N (sondeo-29n, `notifyBanda`) avisa
 * de cada cambio de una pieza de La Banda: aprobada, rechazada (con motivo) o publicada. Bearer
 * LA_BANDA_API_KEY + `X-Banda-Signature: sha256=HMAC(POLITICA_SECRET, cuerpo exacto)`. Una pieza que
 * no es nuestra responde 200 (`ignorado`) para que no reintente.
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
    const r = await aplicarAviso(vista, { store: politicaStoreDb })
    return NextResponse.json(r.ok ? { ok: true, piezaId: r.piezaId ?? null, estado: r.estado ?? null } : { ok: true, ignorado: true })
  } catch (err) {
    console.error('[la-banda] aviso politica', vista.id, err)
    return NextResponse.json({ error: 'no se pudo aplicar el aviso' }, { status: 500 })
  }
}
