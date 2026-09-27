/**
 * Cliente del endpoint de servicio de WordNext (wp-next-starter, POST /api/la-banda/sitios).
 * La plataforma es la dueña de sus tenants: La Banda solo les siembra páginas por su API.
 *
 * Variables: WORDNEXT_URL (p. ej. https://app.wordnext.tech) y WORDNEXT_API_KEY (Bearer;
 * la misma clave que wp-next-starter tiene en Vercel). Patrón demo-safe como clinica.ts:
 * sin ellas, `hasWordnext()` es false y todas las llamadas devuelven { error } sin lanzar.
 */

import { fetchLimpio } from '@/lib/httpLimpio'

const TIMEOUT_MS = 30_000

export interface PaginaWordNext {
  title: string
  slug: string
  kind: 'PAGE' | 'HOME' | 'LEGAL' | 'LANDING'
  blocks: Record<string, unknown>[]
}

export interface ResultadoWordNext {
  ok: true
  tenantId: string
  domain: string
  url: string
  creadas: number
  omitidas: number
}

/** Un error lleva `detalle` con el cuerpo del 4xx cuando lo hay. */
export type Resultado<T> = T | { error: string; detalle?: unknown }

export function hasWordnext(): boolean {
  return Boolean(process.env.WORDNEXT_URL?.trim() && process.env.WORDNEXT_API_KEY?.trim())
}

function base(): string {
  return (process.env.WORDNEXT_URL ?? '').trim().replace(/\/+$/, '')
}

export function esError<T>(r: Resultado<T>): r is { error: string; detalle?: unknown } {
  return typeof r === 'object' && r !== null && 'error' in r && typeof (r as { error?: unknown }).error === 'string'
}

async function llamar<T>(body: unknown): Promise<Resultado<T>> {
  if (!hasWordnext()) return { error: 'WordNext no configurado (WORDNEXT_URL / WORDNEXT_API_KEY)' }
  try {
    // fetchLimpio y no fetch: wp-next-starter también es Vercel y su borde devuelve 508
    // si la petición llega con la traza x-vercel-id de la cadena de ticks.
    const res = await fetchLimpio(`${base()}/api/la-banda/sitios`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${process.env.WORDNEXT_API_KEY!.trim()}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      timeoutMs: TIMEOUT_MS,
    })
    const data = (await res.json<Record<string, unknown>>().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok) return { error: `WordNext ${res.status}: ${String(data?.error ?? res.statusText)}`, detalle: data ?? undefined }
    if (!data) return { error: 'WordNext: respuesta vacía' }
    return data as T
  } catch (err) {
    return { error: `WordNext: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** Alcance sitio: crea el tenant y siembra sus páginas. */
export function crearSitio(body: { nombre: string; subdominio?: string | null; pages: PaginaWordNext[]; bandaSiteId: string }) {
  return llamar<ResultadoWordNext>({ alcance: 'sitio', nombre: body.nombre, subdominio: body.subdominio ?? undefined, pages: body.pages, bandaSiteId: body.bandaSiteId })
}

/** Alcance páginas: siembra páginas en un tenant existente. */
export function agregarPaginas(body: { tenantId: string; pages: PaginaWordNext[]; bandaSiteId: string }) {
  return llamar<ResultadoWordNext>({ alcance: 'paginas', tenantId: body.tenantId, pages: body.pages, bandaSiteId: body.bandaSiteId })
}
