import { manejarGet } from '@/lib/negociacion/api'
import { redStoreDb } from '@/lib/negociacion/store'

export const dynamic = 'force-dynamic'

/** GET → estado, historial de ofertas y propuesta (solo las dos partes, con su clave). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return manejarGet(req, id, redStoreDb)
}
