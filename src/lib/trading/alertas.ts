/**
 * Alertas «cuando pasa algo»: avisan SOLO en la transición, para no repetir en cada ciclo del cron.
 * `evaluarAlerta` es PURO (dado el estado previo y lo observado ahora, devuelve los avisos y el estado
 * nuevo). El cron la llama por símbolo, junta los avisos en un correo y guarda el estado.
 */
import type { Accion } from './recomendaciones'

const base = (symbol: string) => symbol.split('-')[0]
const usd = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)} $`)
const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)} %`

/** Umbral de «movimiento fuerte» del día. */
export const UMBRAL_MOVIMIENTO = 0.07

export interface EstadoAlerta {
  accion: Accion | null
  stop: number | null
  objetivo: number | null
  stopAvisado: boolean
  objetivoAvisado: boolean
  bigMoveDay: string | null
}

export const ESTADO_VACIO: EstadoAlerta = { accion: null, stop: null, objetivo: null, stopAvisado: false, objetivoAvisado: false, bigMoveDay: null }

export interface Observado {
  symbol: string
  accion: Accion | null
  precio: number | null
  stop: number | null
  objetivo: number | null
  cambio1: number | null
  day: string
}

/** Compara lo observado con el estado previo y devuelve los avisos nuevos + el estado a guardar. */
export function evaluarAlerta(prev: EstadoAlerta, o: Observado, umbral = UMBRAL_MOVIMIENTO): { avisos: string[]; estado: EstadoAlerta } {
  const avisos: string[] = []
  const b = base(o.symbol)

  // 1) Cambio de recomendación.
  if (o.accion && prev.accion && o.accion !== prev.accion) {
    avisos.push(`${b}: la recomendación pasa de ${prev.accion} a ${o.accion}.`)
  }

  // 2) Niveles tocados (una sola vez por nivel; se rearma si el nivel cambia).
  const nivelesCambiaron = o.stop !== prev.stop || o.objetivo !== prev.objetivo
  let stopAvisado = nivelesCambiaron ? false : prev.stopAvisado
  let objetivoAvisado = nivelesCambiaron ? false : prev.objetivoAvisado
  if (o.stop != null && o.precio != null && o.precio <= o.stop && !stopAvisado) {
    avisos.push(`${b}: el precio (${usd(o.precio)}) ha tocado el stop (${usd(o.stop)}).`)
    stopAvisado = true
  }
  if (o.objetivo != null && o.precio != null && o.precio >= o.objetivo && !objetivoAvisado) {
    avisos.push(`${b}: el precio (${usd(o.precio)}) ha alcanzado el objetivo (${usd(o.objetivo)}).`)
    objetivoAvisado = true
  }

  // 3) Movimiento fuerte del día (una vez al día).
  let bigMoveDay = prev.bigMoveDay
  if (o.cambio1 != null && Math.abs(o.cambio1) >= umbral && prev.bigMoveDay !== o.day) {
    avisos.push(`${b}: movimiento fuerte hoy (${pct(o.cambio1)}).`)
    bigMoveDay = o.day
  }

  return { avisos, estado: { accion: o.accion, stop: o.stop, objetivo: o.objetivo, stopAvisado, objetivoAvisado, bigMoveDay } }
}

/** Normaliza el jsonb guardado a EstadoAlerta (tolerante a filas viejas/ausentes). */
export function leerEstado(raw: unknown): EstadoAlerta {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const acc = o.accion
  return {
    accion: acc === 'comprar' || acc === 'vender' || acc === 'mantener' || acc === 'fuera' ? acc : null,
    stop: num(o.stop),
    objetivo: num(o.objetivo),
    stopAvisado: o.stopAvisado === true,
    objetivoAvisado: o.objetivoAvisado === true,
    bigMoveDay: typeof o.bigMoveDay === 'string' ? o.bigMoveDay : null,
  }
}
