/**
 * Ciclo del cron de peticiones (/api/cron/peticiones, cada 5 min). Tres trabajos:
 * 1. Cerrar el estado de las filas cuya sesión terminó (failed → fallida, vetoed → vetada).
 * 2. Guarda de huecos: sesión `closed` con finalReport pero fila sin informe
 *    (Helsinki no llegó a llamar a la herramienta) → informe desde finalReport (espejo
 *    de la guarda `forzadoBorrador` de corpus) y aviso.
 * 3. Reintentos del webhook: avisos `pendiente` vencidos según el backoff; los que
 *    pasan de plazo (12 intentos o 24 h) se marcan `agotado`.
 */

import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { sessions } from '@/db/schema'
import { peticiones, type EstadoPeticion, type Peticion } from '@/db/peticiones'
import { getPeticion, guardarInforme, setPeticionEstado } from './peticiones'
import { componerInformeDesdeFinalReport } from './informe'
import { agotadoAviso, intentarAviso, venceAviso, type CuerpoAviso } from './webhook'

export interface ResultadoCicloPeticiones {
  /** Informes registrados por la guarda de huecos. */
  completadas: string[]
  /** Filas marcadas fallida/vetada por sesión terminada. */
  cerradas: string[]
  /** Webhooks entregados (intento 1 o reintento). */
  avisados: string[]
  /** Webhooks con error (quedan pendientes para el siguiente ciclo). */
  fallidos: Record<string, string>
  /** Avisos agotados sin entregar. */
  agotados: string[]
}

function informeUrl(id: string): string {
  const base = (process.env.APP_URL ?? '').trim().replace(/\/+$/, '')
  return `${base || ''}/api/v1/peticiones/${id}`
}

function cuerpoDe(p: Peticion, evento: CuerpoAviso['evento'], now: number): CuerpoAviso {
  return {
    evento,
    peticionId: p.id,
    referencia: p.referencia,
    titulo: p.titulo,
    sessionId: p.sessionId,
    estado: evento === 'informe' ? 'completada' : p.estado,
    informe: evento === 'informe' ? p.informe : undefined,
    informeUrl: evento === 'informe' ? informeUrl(p.id) : undefined,
    fecha: new Date(now).toISOString(),
  }
}

async function avisar(p: Peticion, evento: CuerpoAviso['evento'], r: ResultadoCicloPeticiones, now: number): Promise<void> {
  const res = await intentarAviso(p, cuerpoDe(p, evento, now), { now: () => now })
  if (res.ok) r.avisados.push(p.id)
  else r.fallidos[p.id] = res.error ?? 'error'
}

/** La fila aún no se ha avisado de nada (Helsinki o la guarda lo harán ahora). */
const sinAvisar = (p: Peticion) => p.webhookUrl && p.avisoEstado === 'no_aplica'

export async function cicloPeticiones(now = Date.now()): Promise<ResultadoCicloPeticiones> {
  const r: ResultadoCicloPeticiones = { completadas: [], cerradas: [], avisados: [], fallidos: {}, agotados: [] }

  // 1+2. Filas con sesión ya terminada cuyo estado aún no lo refleja.
  const abiertas = await db.select().from(peticiones).where(inArray(peticiones.estado, ['recibida', 'en_curso']))
  for (const p of abiertas) {
    if (!p.sessionId) continue
    const [s] = await db.select().from(sessions).where(eq(sessions.id, p.sessionId)).limit(1)
    if (!s || s.status === 'open') continue

    if (s.status === 'closed' && s.finalReport && !p.informe) {
      const informe = componerInformeDesdeFinalReport(s.finalReport, p.titulo)
      if (informe) {
        await guardarInforme(p.id, informe)
        r.completadas.push(p.id)
        const actualizada = await getPeticion(p.id)
        if (actualizada && sinAvisar(actualizada)) await avisar(actualizada, 'informe', r, now)
        continue
      }
    }

    if (s.status === 'closed') continue // cerrada con informe ya registrado: nada que hacer

    const estado: EstadoPeticion = s.status === 'vetoed' ? 'vetada' : 'fallida'
    await setPeticionEstado(p.id, estado)
    r.cerradas.push(p.id)
    const actualizada = await getPeticion(p.id)
    if (actualizada && sinAvisar(actualizada)) await avisar(actualizada, 'fallida', r, now)
  }

  // 3. Reintentos de avisos pendientes (backoff) y agotados.
  const pendientes = await db.select().from(peticiones).where(eq(peticiones.avisoEstado, 'pendiente'))
  for (const p of pendientes) {
    if (agotadoAviso(p, now)) {
      await db.update(peticiones).set({ avisoEstado: 'agotado' }).where(eq(peticiones.id, p.id))
      r.agotados.push(p.id)
      continue
    }
    if (!venceAviso(p, now)) continue
    await avisar(p, p.informe ? 'informe' : 'fallida', r, now)
  }

  return r
}
