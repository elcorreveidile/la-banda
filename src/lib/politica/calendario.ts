/**
 * Calendario de las ediciones (hora de Madrid). Puro: sin BD ni reloj propio.
 * Cada edición se PREPARA tres horas antes de publicarse (06:30 → 09:00, 12:30 → 15:00,
 * 18:30 → 21:00) para dejar a Javier tiempo de revisarla.
 */

import { madridAUtc, partesMadrid } from '@/lib/marketing/calendario'

export type EdicionId = 'manana' | 'tarde' | 'noche'

export const EDICIONES: { id: EdicionId; label: string; abre: [number, number]; publica: [number, number] }[] = [
  { id: 'manana', label: 'Mañana', abre: [6, 30], publica: [9, 0] },
  { id: 'tarde', label: 'Tarde', abre: [12, 30], publica: [15, 0] },
  { id: 'noche', label: 'Noche', abre: [18, 30], publica: [21, 0] },
]

/** Una edición todavía se abre hasta tres horas después de su hora de publicación (cron caído). */
export const GRACIA_MS = 3 * 60 * 60 * 1000

const pad = (n: number) => String(n).padStart(2, '0')

export function diaMadrid(now: Date): string {
  const p = partesMadrid(now)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}

function instante(dia: string, [h, min]: [number, number]): Date {
  const [y, m, d] = dia.split('-').map(Number)
  return madridAUtc(y, m, d, h, min)
}

export const publicaEn = (dia: string, id: EdicionId): Date => instante(dia, EDICIONES.find((e) => e.id === id)!.publica)
export const abreEn = (dia: string, id: EdicionId): Date => instante(dia, EDICIONES.find((e) => e.id === id)!.abre)

export const etiquetaEdicion = (id: string | null | undefined): string => EDICIONES.find((e) => e.id === id)?.label ?? (id === 'madrugada' ? 'Madrugada' : id === 'extra' ? 'Extra' : '—')

export interface EdicionDebida {
  dia: string
  edicion: EdicionId
  programadoPara: Date
}

/**
 * Ediciones de HOY que toca abrir: ya ha pasado su hora de apertura, no ha pasado su gracia, el día
 * está dentro del rango y no hay una pieza de esa edición (`ocupadas` = claves `día:edición`).
 */
export function edicionesDebidas(now: Date, ocupadas: Set<string>, rango: { desde: string; hasta: string }): EdicionDebida[] {
  const dia = diaMadrid(now)
  if (dia < rango.desde || dia > rango.hasta) return []
  return EDICIONES.filter((e) => {
    const abre = abreEn(dia, e.id)
    const publica = publicaEn(dia, e.id)
    return now >= abre && now.getTime() < publica.getTime() + GRACIA_MS && !ocupadas.has(`${dia}:${e.id}`)
  }).map((e) => ({ dia, edicion: e.id, programadoPara: publicaEn(dia, e.id) }))
}
