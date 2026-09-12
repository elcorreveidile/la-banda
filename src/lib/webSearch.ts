/**
 * Búsqueda web por la API de z.ai (0,01 $ por uso).
 * POST https://api.z.ai/api/paas/v4/web_search · Bearer ZAI_API_KEY.
 */
export interface SearchHit {
  title: string
  content: string
  media: string
  publishDate: string
  link: string
}

export async function webSearch(query: string, opts: { recency?: 'oneDay' | 'oneWeek' | 'oneMonth' | 'noLimit'; count?: number } = {}): Promise<{ query: string; results: SearchHit[] } | { query: string; error: string }> {
  const key = process.env.ZAI_API_KEY?.trim()
  if (!key) return { query, error: 'búsqueda no configurada (falta ZAI_API_KEY)' }
  const base = (process.env.ZAI_SEARCH_URL?.trim() || 'https://api.z.ai/api/paas/v4/web_search').replace(/\/$/, '')
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'accept-language': 'en-US,en' },
      body: JSON.stringify({ search_engine: 'search-prime', search_query: query.slice(0, 200), count: Math.min(Math.max(opts.count ?? 5, 1), 10), search_recency_filter: opts.recency ?? 'oneDay' }),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    })
    if (!res.ok) return { query, error: `z.ai web_search ${res.status}` }
    const data = (await res.json()) as { search_result?: { title?: string; content?: string; media?: string; publish_date?: string; link?: string }[] }
    return {
      query,
      results: (data.search_result ?? []).map((r) => ({
        title: r.title ?? '',
        content: (r.content ?? '').slice(0, 600),
        media: r.media ?? '',
        publishDate: r.publish_date ?? '',
        link: r.link ?? '',
      })),
    }
  } catch (err) {
    return { query, error: err instanceof Error ? err.message : String(err) }
  }
}
