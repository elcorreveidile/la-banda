import { manejarBajaNodo } from '@/lib/negociacion/api'
import { redStoreDb } from '@/lib/negociacion/store'

export const dynamic = 'force-dynamic'

/** DELETE → baja del nodo (exige x-banda-nodo-clave). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return manejarBajaNodo(req, id, redStoreDb)
}
