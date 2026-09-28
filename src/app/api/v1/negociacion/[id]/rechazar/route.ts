import { manejarDecision } from '@/lib/negociacion/api'
import { redStoreDb } from '@/lib/negociacion/store'

export const dynamic = 'force-dynamic'

/** POST → la persona de una parte rechaza la propuesta (x-banda-nodo + x-banda-nodo-clave). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return manejarDecision(req, id, 'rechazar', { store: redStoreDb })
}
