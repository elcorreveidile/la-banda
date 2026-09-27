/**
 * Aviso por webhook con el informe de una petición (o el aviso de fallo).
 * El intento 1 lo dispara la herramienta registrarInforme de Helsinki; los
 * reintentos los hace el cron /api/cron/peticiones con backoff (sin timers).
 *
 * Firma: `x-la-banda-firma: sha256=<HMAC-SHA256(PETICIONES_WEBHOOK_SECRET, body)>`.
 * Sin secreto la petición va sin firma (el payload lo indica en `firmado: false`).
 * URL externa al despliegue: fetch normal, no fetchLimpio (el 508 es del borde de
 * Vercel contra funciones propias).
 */

import { createHmac } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { peticiones, peticionesAvisos, type Peticion } from '@/db/peticiones'

const TIMEOUT_MS = 8_000

/** Tras 12 intentos (o 24 h desde el último) el aviso se da por agotado. */
export const MAX_AVISOS = 12
const EDAD_MAXIMA_MS = 24 * 60 * 60_000
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000]

export interface CuerpoAviso {
  evento: 'informe' | 'fallida'
  peticionId: string
  referencia: string | null
  titulo: string
  sessionId: string | null
  estado: string
  informe?: unknown
  informeUrl?: string
  fecha: string
}

export interface DepsWebhook {
  /** Inyectable para tests. */
  fetchFn?: typeof fetch
  now?: () => number
}

function firmaDe(body: string): string | null {
  const secreto = process.env.PETICIONES_WEBHOOK_SECRET?.trim()
  if (!secreto) return null
  return `sha256=${createHmac('sha256', secreto).update(body).digest('hex')}`
}

export async function enviarWebhook(url: string, cuerpo: CuerpoAviso, deps: DepsWebhook = {}): Promise<{ ok: boolean; codigo?: number; error?: string }> {
  const conSecreto = Boolean(process.env.PETICIONES_WEBHOOK_SECRET?.trim())
  const body = JSON.stringify({ ...cuerpo, firmado: conSecreto })
  const firma = conSecreto ? firmaDe(body) : null
  try {
    const res = await (deps.fetchFn ?? fetch)(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(firma ? { 'x-la-banda-firma': firma } : {}),
        'x-la-banda-firmado': conSecreto ? 'true' : 'false',
        'x-la-banda-evento': cuerpo.evento,
        'x-la-banda-peticion': cuerpo.peticionId,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    // 2xx = entregado; cualquier otra cosa se reintenta.
    if (res.ok) return { ok: true, codigo: res.status }
    return { ok: false, codigo: res.status, error: `receptor respondió ${res.status}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** ¿Toca reintentar el aviso de esta petición (estado pendiente)? */
export function venceAviso(p: Pick<Peticion, 'avisoEstado' | 'avisoIntentos' | 'avisoUltimoAt'>, now = Date.now()): boolean {
  if (p.avisoEstado !== 'pendiente') return false
  if (p.avisoIntentos >= MAX_AVISOS) return false
  const ultimo = p.avisoUltimoAt ? p.avisoUltimoAt.getTime() : 0
  // Tras N intentos fallidos se espera BACKOFF_MS[N-1]: 1, 5, 15 y luego 60 min.
  const espera = BACKOFF_MS[Math.min(Math.max(p.avisoIntentos - 1, 0), BACKOFF_MS.length - 1)]
  return now - ultimo >= espera
}

/** ¿El aviso quedó agotado sin entregar (para marcarlo y dejar de intentar)? */
export function agotadoAviso(p: Pick<Peticion, 'avisoEstado' | 'avisoIntentos' | 'avisoUltimoAt'>, now = Date.now()): boolean {
  if (p.avisoEstado !== 'pendiente') return false
  if (p.avisoIntentos >= MAX_AVISOS) return true
  const ultimo = p.avisoUltimoAt ? p.avisoUltimoAt.getTime() : 0
  return ultimo > 0 && now - ultimo >= EDAD_MAXIMA_MS
}

/**
 * UN intento de aviso: envía, registra el intento en `peticiones_avisos` y actualiza
 * `avisoEstado`/`avisoIntentos`/`avisoUltimoAt` de la fila, fila a fila (sin transacción).
 */
export async function intentarAviso(p: Peticion, cuerpo: CuerpoAviso, deps: DepsWebhook = {}): Promise<{ ok: boolean; codigo?: number; error?: string }> {
  const now = new Date((deps.now ?? Date.now)())
  const intento = p.avisoIntentos + 1
  const r = await enviarWebhook(p.webhookUrl!, cuerpo, deps)
  await db.insert(peticionesAvisos).values({
    id: crypto.randomUUID(),
    peticionId: p.id,
    intento,
    estado: r.ok ? 'ok' : 'error',
    codigo: r.codigo ?? null,
    error: r.error ?? null,
    createdAt: now,
  })
  await db
    .update(peticiones)
    .set({
      avisoEstado: r.ok ? 'enviado' : 'pendiente',
      avisoIntentos: intento,
      avisoUltimoAt: now,
      avisoUltimoError: r.error ?? null,
    })
    .where(eq(peticiones.id, p.id))
  return r
}
