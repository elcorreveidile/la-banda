/**
 * Track record: ¿acertaron las recomendaciones? Guarda una foto diaria de la recomendación por símbolo
 * y la evalúa contra el precio actual (desde cada recomendación hasta hoy). Así sabes cuánto fiarte.
 * `evaluarReco` y `trackRecord` son PUROS; las lecturas/escrituras de BD van aparte.
 */
import { desc } from 'drizzle-orm'
import { db } from '@/db'
import { recomendacionHistorial } from '@/db/trading'
import { hoyUTC } from './cartera'
import type { Accion } from './recomendaciones'

export type Veredicto = 'acierto' | 'fallo' | 'neutro'

/** Evalúa una recomendación: comprar acierta si subió; vender si bajó; mantener si no cayó; fuera neutro. */
export function evaluarReco(accion: Accion, precioRef: number, precioActual: number | null, banda = 0.02): Veredicto {
  if (precioActual == null || !(precioRef > 0)) return 'neutro'
  const ch = precioActual / precioRef - 1
  switch (accion) {
    case 'comprar':
      return ch > banda ? 'acierto' : ch < -banda ? 'fallo' : 'neutro'
    case 'vender':
      return ch < -banda ? 'acierto' : ch > banda ? 'fallo' : 'neutro'
    case 'mantener':
      return ch >= -banda ? 'acierto' : 'fallo'
    default:
      return 'neutro' // fuera: sin posición, no se puntúa
  }
}

export interface RecoPasada {
  symbol: string
  accion: Accion
  precioRef: number
}
export interface TrackPorAccion {
  accion: Accion
  aciertos: number
  fallos: number
  pct: number | null
}
export interface TrackRecord {
  porAccion: TrackPorAccion[]
  aciertos: number
  fallos: number
  pct: number | null
  evaluadas: number
}

/** Agrega la tasa de acierto por acción evaluando el histórico contra el precio actual de cada símbolo. */
export function trackRecord(historial: RecoPasada[], precios: Record<string, number | null>, banda = 0.02): TrackRecord {
  const acc: Partial<Record<Accion, { a: number; f: number }>> = {}
  for (const h of historial) {
    const v = evaluarReco(h.accion, h.precioRef, precios[h.symbol] ?? null, banda)
    if (v === 'neutro') continue
    const bucket = (acc[h.accion] ??= { a: 0, f: 0 })
    if (v === 'acierto') bucket.a++
    else bucket.f++
  }
  const porAccion: TrackPorAccion[] = (['comprar', 'vender', 'mantener'] as Accion[])
    .filter((k) => acc[k])
    .map((k) => {
      const { a, f } = acc[k]!
      const t = a + f
      return { accion: k, aciertos: a, fallos: f, pct: t ? a / t : null }
    })
  const aciertos = porAccion.reduce((s, p) => s + p.aciertos, 0)
  const fallos = porAccion.reduce((s, p) => s + p.fallos, 0)
  const tot = aciertos + fallos
  return { porAccion, aciertos, fallos, pct: tot ? aciertos / tot : null, evaluadas: tot }
}

/* --- BD --- */

/** Guarda (o actualiza) la recomendación de hoy por símbolo. Mejor esfuerzo. */
export async function registrarRecoHistorial(symbol: string, accion: Accion, precioUsd: number, confianza: string, day = hoyUTC()): Promise<void> {
  if (!(precioUsd > 0)) return
  await db
    .insert(recomendacionHistorial)
    .values({ symbol, day, accion, precioUsd: precioUsd.toFixed(8), confianza })
    .onConflictDoUpdate({ target: [recomendacionHistorial.symbol, recomendacionHistorial.day], set: { accion, precioUsd: precioUsd.toFixed(8), confianza } })
}

/** Últimas recomendaciones guardadas (hasta `limite` filas, recientes primero → como RecoPasada). */
export async function leerHistorialRecos(limite = 400): Promise<RecoPasada[]> {
  const rows = await db.select().from(recomendacionHistorial).orderBy(desc(recomendacionHistorial.day)).limit(Math.min(Math.max(limite, 1), 1000))
  const esAccion = (a: string): a is Accion => a === 'comprar' || a === 'vender' || a === 'mantener' || a === 'fuera'
  return rows.filter((r) => esAccion(r.accion)).map((r) => ({ symbol: r.symbol, accion: r.accion as Accion, precioRef: Number(r.precioUsd) }))
}
