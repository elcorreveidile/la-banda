import { manejarAltaNodo, manejarBuscarNodos } from '@/lib/negociacion/api'
import { redStoreDb } from '@/lib/negociacion/store'

export const dynamic = 'force-dynamic'

/** POST → alta o actualización de un nodo (tenant) de la red. GET → descubrimiento por capacidad o sector. */
export async function POST(req: Request) {
  return manejarAltaNodo(req, redStoreDb)
}

export async function GET(req: Request) {
  return manejarBuscarNodos(req, redStoreDb)
}
