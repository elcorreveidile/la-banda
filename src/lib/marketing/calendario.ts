/**
 * Calendario SEMANAL del marketing (Javier: «la revisión de cada semana quiero hacerla cada
 * domingo»). Todo en hora de Madrid:
 * - jueves: la banda propone los temas;
 * - jueves a sábado: redacta los artículos de la SEMANA SIGUIENTE con los temas ya aprobados y
 *   los manda a WordNext, programados;
 * - domingo 08:00: resumen por correo con lo que espera revisión (artículos en WordNext y
 *   temas en La Banda);
 * - la semana siguiente se publican en sus días (martes y jueves a las 09:00 con 2 por semana).
 * Puro: sin BD ni reloj propio.
 */

export const ZONA = 'Europe/Madrid'
export const HORA_PUBLICACION = 9
export const HORA_RESUMEN = 8

/** Días de publicación por orden de preferencia (0 = domingo … 6 = sábado). */
const PREFERENCIA_DIAS = [2, 4, 1, 3, 5]

export interface PartesMadrid {
  y: number
  m: number
  d: number
  h: number
  min: number
  /** 0 = domingo … 6 = sábado. */
  dow: number
}

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function partesMadrid(t: Date): PartesMadrid {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
  const p = Object.fromEntries(f.formatToParts(t).map((x) => [x.type, x.value]))
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute), dow: DOW[p.weekday] ?? 0 }
}

/** Instante UTC de una hora local de Madrid (dos pasadas: resuelve el cambio de hora). */
export function madridAUtc(y: number, m: number, d: number, h: number, min = 0): Date {
  const deseado = Date.UTC(y, m - 1, d, h, min)
  let t = deseado
  for (let i = 0; i < 2; i++) {
    const p = partesMadrid(new Date(t))
    const visto = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min)
    t += deseado - visto
  }
  return new Date(t)
}

/** Días de la semana en que se publica con `n` artículos por semana, ordenados de lunes a viernes. */
export function diasPublicacion(n: number): number[] {
  return PREFERENCIA_DIAS.slice(0, Math.max(1, Math.min(n, PREFERENCIA_DIAS.length))).sort((a, b) => a - b)
}

/** Lunes (fecha de Madrid) de la semana que empieza tras el próximo domingo de revisión. */
export function lunesSemanaSiguiente(now: Date): { y: number; m: number; d: number } {
  const p = partesMadrid(now)
  // Días hasta el próximo lunes (si hoy es lunes, el de la semana que viene).
  const hasta = ((8 - p.dow) % 7) || 7
  const base = new Date(Date.UTC(p.y, p.m - 1, p.d + hasta))
  return { y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate() }
}

/** Huecos de publicación de la semana siguiente (instantes UTC), en orden. */
export function huecosSemanaSiguiente(now: Date, porSemana: number): Date[] {
  const l = lunesSemanaSiguiente(now)
  return diasPublicacion(porSemana).map((dow) => {
    const dia = new Date(Date.UTC(l.y, l.m - 1, l.d + (dow - 1)))
    return madridAUtc(dia.getUTCFullYear(), dia.getUTCMonth() + 1, dia.getUTCDate(), HORA_PUBLICACION)
  })
}

/** Primer hueco libre de la semana siguiente (los ocupados se comparan por instante). */
export function primerHuecoLibre(now: Date, porSemana: number, ocupados: Date[]): Date | null {
  const usados = new Set(ocupados.map((d) => d.getTime()))
  return huecosSemanaSiguiente(now, porSemana).find((h) => !usados.has(h.getTime())) ?? null
}

/** ¿Toca proponer temas? Jueves desde las 07:00 de Madrid. */
export const esDiaDePlan = (now: Date) => {
  const p = partesMadrid(now)
  return p.dow === 4 && p.h >= 7
}

/** ¿Toca redactar? Jueves (desde las 07:00), viernes y sábado: todo listo antes del domingo. */
export const esDiaDeRedaccion = (now: Date) => {
  const p = partesMadrid(now)
  return (p.dow === 4 && p.h >= 7) || p.dow === 5 || p.dow === 6
}

/** ¿Toca el resumen del domingo? Domingo a las 08:xx de Madrid (el cron corre cada hora). */
export const esHoraDeResumen = (now: Date) => {
  const p = partesMadrid(now)
  return p.dow === 0 && p.h === HORA_RESUMEN
}

/** Inicio (UTC) del día de Madrid de hace `dias` días: para «¿ya se planificó esta semana?». */
export function haceDias(now: Date, dias: number): Date {
  return new Date(now.getTime() - dias * 86_400_000)
}

/** Mañana a la hora de publicación (Madrid), saltando sábado y domingo (dow: 0 = domingo). */
export function siguienteDiaLaborable(now: Date): Date {
  const p = partesMadrid(now)
  let sumar = 1
  while (![1, 2, 3, 4, 5].includes((p.dow + sumar) % 7)) sumar++
  const base = new Date(Date.UTC(p.y, p.m - 1, p.d + sumar))
  return madridAUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), HORA_PUBLICACION)
}
