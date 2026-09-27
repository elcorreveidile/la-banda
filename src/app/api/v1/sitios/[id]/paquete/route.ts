import { NextResponse } from 'next/server'
import { apiUnauthorized } from '@/lib/apiAuth'
import { filesForSite, getSite } from '@/lib/sitios/sites'
import { zipDeSitio } from '@/lib/sitios/paquete'

export const dynamic = 'force-dynamic'

/** GET /api/v1/sitios/:id/paquete → el paquete estático en zip (Bearer LA_BANDA_API_KEY). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = apiUnauthorized(req)
  if (denied) return denied
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
