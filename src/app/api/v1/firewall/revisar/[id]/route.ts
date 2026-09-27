import { manejarGet } from '@/lib/firewall/api'
import { firewallStoreDb } from '@/lib/firewall/store'

export const dynamic = 'force-dynamic'

/** GET /api/v1/firewall/revisar/:id → estado y veredicto de la revisión (mismo JSON que el webhook). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return manejarGet(req, id, firewallStoreDb)
}
