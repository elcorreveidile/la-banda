import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { filesForSite, getSite } from '@/lib/sitios/sites'
import { zipDeSitio } from '@/lib/sitios/paquete'

export const dynamic = 'force-dynamic'

/** GET /api/panel/sitios/:id/paquete → descarga del paquete estático desde el panel (guard auth()). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await auth()
  if (!me?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const site = await getSite(id)
  if (!site) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const files = await filesForSite(id)
  if (!files.length) return NextResponse.json({ error: 'el sitio no tiene paquete estático' }, { status: 404 })
  const { bytes, nombre } = await zipDeSitio(site, files)
  return new NextResponse(bytes, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${nombre}"`,
    },
  })
}
