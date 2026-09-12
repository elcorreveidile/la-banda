import { NextResponse } from 'next/server'

/**
 * Clave de servidor para la API v1 (la consumen olvidosdegranada.es y por2duros.com
 * desde su servidor, nunca desde el navegador). Cabecera: Authorization: Bearer LA_BANDA_API_KEY.
 */
export function apiUnauthorized(req: Request): NextResponse | null {
  const key = process.env.LA_BANDA_API_KEY?.trim()
  if (!key) return NextResponse.json({ error: 'API no configurada (falta LA_BANDA_API_KEY)' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${key}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return null
}
