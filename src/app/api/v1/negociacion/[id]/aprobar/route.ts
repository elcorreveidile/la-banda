import { manejarDecision } from '@/lib/negociacion/api'
import { redStoreDb } from '@/lib/negociacion/store'

export const dynamic = 'force-dynamic'

/** POST → la persona de una parte aprueba la propuesta (x-banda-nodo + x-banda-nodo-clave). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return manejarDecision(req, id, 'aprobar', { store: redStoreDb })
}
