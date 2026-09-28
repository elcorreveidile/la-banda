/**
 * Reglas DETERMINISTAS de la negociación B2B (puro, sin BD ni modelo).
 *
 * Principio: los agentes proponen y redactan, pero NINGUNA oferta sale de los límites que
 * fija cada dueño. Esto lo decide el código, no el LLM:
 * - suelo por unidad del vendedor = max(mínimo propio, precio de lista − descuento máximo);
 * - el vendedor oferta precios por línea entre su suelo y su precio de lista, y solo hasta
 *   `rondasMax` veces;
 * - el comprador acepta la última oferta solo si cabe en su presupuesto; su contraoferta
 *   tampoco puede pasar de él;
 * - la zona de acuerdo existe si la suma de suelos cabe en el presupuesto;
 * - un mensaje que intenta manipular al agente contrario (inyección) veta la negociación.
 * Importes siempre en céntimos de euro (enteros).
 */

import type { ItemCatalogo, LimitesVendedor, LineaPrecio, LineaSolicitud, Oferta, Propuesta, SnapshotVendedor } from '@/db/negociacion'

export const MAX_LINEAS = 20
export const MAX_CANTIDAD = 1000
export const MAX_MENSAJE = 600
export const RONDAS_MAX_TOPE = 10
export const DESCUENTO_MAX_TOPE = 90

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string }
const ok = <T>(valor: T): Resultado<T> => ({ ok: true, valor })
const mal = (error: string): Resultado<never> => ({ ok: false, error })

const entero = (n: unknown) => typeof n === 'number' && Number.isInteger(n)

/** Suelo por unidad: lo mínimo que el vendedor puede cobrar por un item. */
export function suelo(item: ItemCatalogo, limites: LimitesVendedor): number {
  const pct = Math.min(Math.max(limites.descuentoMaxPct, 0), DESCUENTO_MAX_TOPE)
  const porDescuento = Math.ceil((item.precioCents * (100 - pct)) / 100)
  return Math.max(item.minimoCents ?? 0, porDescuento)
}

/** Items de la solicitud en el catálogo del vendedor (congelado al abrir). */
export function itemsDeSolicitud(lineas: LineaSolicitud[], catalogo: ItemCatalogo[]): Resultado<ItemCatalogo[]> {
  if (lineas.length === 0) return mal('la solicitud no tiene líneas')
  if (lineas.length > MAX_LINEAS) return mal(`máximo ${MAX_LINEAS} líneas`)
  const vistos = new Set<string>()
  const items: ItemCatalogo[] = []
  for (const l of lineas) {
    if (vistos.has(l.itemId)) return mal(`línea repetida: ${l.itemId}`)
    vistos.add(l.itemId)
    if (!entero(l.cantidad) || l.cantidad < 1 || l.cantidad > MAX_CANTIDAD) return mal(`cantidad inválida en ${l.itemId}`)
    const item = catalogo.find((i) => i.id === l.itemId)
    if (!item) return mal(`el vendedor no ofrece ${l.itemId}`)
    items.push(item)
  }
  return ok(items)
}

export const totalDe = (lineas: LineaPrecio[]) => lineas.reduce((n, l) => n + l.precioUnitCents * l.cantidad, 0)

/** Precio de lista total de la solicitud. */
export function totalLista(lineas: LineaSolicitud[], v: SnapshotVendedor): number {
  return lineas.reduce((n, l) => n + (v.items.find((i) => i.id === l.itemId)?.precioCents ?? 0) * l.cantidad, 0)
}

/** Suma de suelos de la solicitud (privada del vendedor). */
export function totalSuelo(lineas: LineaSolicitud[], v: SnapshotVendedor): number {
  return lineas.reduce((n, l) => {
    const item = v.items.find((i) => i.id === l.itemId)
    return n + (item ? suelo(item, v.limites) : 0) * l.cantidad
  }, 0)
}

/** ¿Hay zona de acuerdo? (la suma de suelos cabe en el presupuesto del comprador). */
export function hayZonaDeAcuerdo(lineas: LineaSolicitud[], v: SnapshotVendedor, presupuestoMaxCents: number): boolean {
  return totalSuelo(lineas, v) <= presupuestoMaxCents
}

export const ofertasDelVendedor = (ofertas: Oferta[]) => ofertas.filter((o) => o.de === 'vendedor' && o.tipo === 'oferta')
export const rondasUsadas = (ofertas: Oferta[]) => ofertasDelVendedor(ofertas).length

/** Valida una oferta del vendedor (precios por línea) contra la solicitud y SUS límites. */
export function validarOfertaVendedor(
  precios: { itemId: string; precioUnitCents: number }[],
  n: { lineas: LineaSolicitud[]; vendedor: SnapshotVendedor; ofertas: Oferta[] },
): Resultado<{ lineas: LineaPrecio[]; totalCents: number; ronda: number }> {
  const ultima = n.ofertas.at(-1)
  if (ultima?.tipo === 'aceptacion') return mal('la oferta ya fue aceptada')
  if (ultima && ultima.de === 'vendedor') return mal('espera la respuesta del comprador antes de ofertar otra vez')
  const rondasMax = Math.min(Math.max(n.vendedor.limites.rondasMax, 1), RONDAS_MAX_TOPE)
  if (rondasUsadas(n.ofertas) >= rondasMax) return mal(`rondas agotadas (${rondasMax})`)
  if (precios.length !== n.lineas.length) return mal('la oferta debe poner precio a todas las líneas de la solicitud, y solo a ellas')
  const lineas: LineaPrecio[] = []
  for (const l of n.lineas) {
    const p = precios.find((x) => x.itemId === l.itemId)
    const item = n.vendedor.items.find((i) => i.id === l.itemId)
    if (!p || !item) return mal(`falta el precio de ${l.itemId}`)
    if (!entero(p.precioUnitCents)) return mal(`precio no entero en ${l.itemId} (céntimos)`)
    if (p.precioUnitCents > item.precioCents) return mal(`${l.itemId}: por encima del precio de lista`)
    if (p.precioUnitCents < suelo(item, n.vendedor.limites)) return mal(`${l.itemId}: por debajo del mínimo que permite el dueño`)
    lineas.push({ itemId: l.itemId, cantidad: l.cantidad, precioUnitCents: p.precioUnitCents })
  }
  return ok({ lineas, totalCents: totalDe(lineas), ronda: rondasUsadas(n.ofertas) + 1 })
}

/** Valida la respuesta del comprador a la última oferta del vendedor. */
export function validarRespuestaComprador(
  r: { tipo: 'aceptacion' } | { tipo: 'contraoferta'; totalCents: number },
  n: { ofertas: Oferta[]; presupuestoMaxCents: number; vendedor: SnapshotVendedor },
): Resultado<{ tipo: 'aceptacion' | 'contraoferta'; totalCents: number; lineas?: LineaPrecio[]; ronda: number }> {
  const ultima = n.ofertas.at(-1)
  if (!ultima || ultima.de !== 'vendedor' || ultima.tipo !== 'oferta') return mal('no hay oferta del vendedor pendiente de respuesta')
  if (r.tipo === 'aceptacion') {
    if (ultima.totalCents > n.presupuestoMaxCents) return mal('la oferta supera el presupuesto máximo del comprador')
    return ok({ tipo: 'aceptacion', totalCents: ultima.totalCents, lineas: ultima.lineas, ronda: ultima.ronda })
  }
  if (!entero(r.totalCents) || r.totalCents <= 0) return mal('contraoferta inválida (céntimos enteros, mayor que 0)')
  if (r.totalCents > n.presupuestoMaxCents) return mal('la contraoferta supera el presupuesto máximo del comprador')
  if (r.totalCents >= ultima.totalCents) return mal('una contraoferta debe ser menor que la oferta; si te vale, acéptala')
  const rondasMax = Math.min(Math.max(n.vendedor.limites.rondasMax, 1), RONDAS_MAX_TOPE)
  if (rondasUsadas(n.ofertas) >= rondasMax) return mal('el vendedor no tiene más rondas: acepta la oferta o no hay acuerdo')
  return ok({ tipo: 'contraoferta', totalCents: r.totalCents, ronda: ultima.ronda })
}

/** Propuesta final: SOLO a partir de una aceptación válida (el código la compone, no el agente). */
export function propuestaDe(n: { ofertas: Oferta[]; vendedor: SnapshotVendedor; lineas: LineaSolicitud[]; presupuestoMaxCents: number }): Resultado<Propuesta> {
  const ultima = n.ofertas.at(-1)
  if (!ultima || ultima.tipo !== 'aceptacion' || !ultima.lineas) return mal('no hay oferta aceptada')
  // Doble control: la aceptada vuelve a pasar los límites de las dos partes.
  const recheck = validarOfertaVendedor(ultima.lineas, { lineas: n.lineas, vendedor: n.vendedor, ofertas: [] })
  if (!recheck.ok) return mal(`la oferta aceptada rompe los límites: ${recheck.error}`)
  if (recheck.valor.totalCents !== ultima.totalCents || ultima.totalCents > n.presupuestoMaxCents) return mal('la oferta aceptada no cuadra con los límites')
  return ok({
    lineas: ultima.lineas.map((l) => {
      const item = n.vendedor.items.find((i) => i.id === l.itemId)!
      return { ...l, nombre: item.nombre, tipo: item.tipo }
    }),
    totalCents: ultima.totalCents,
    moneda: 'EUR',
    ronda: ultima.ronda,
  })
}

/* ---------------- Inyección entre agentes ---------------- */

const INVISIBLES = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ\u{e0000}-\u{e007f}]/u

/** Patrones de manipulación dirigidos a un modelo (es/en). Conservadores: órdenes, no temas. */
const PATRONES: [RegExp, string][] = [
  [/\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|prior|above|all|your)\b[^.\n]{0,20}\b(instructions?|rules|prompt|limits?)/i, 'pide ignorar sus instrucciones'],
  [/\b(ignora|olvida|descarta|salta(te)?)\b[^.\n]{0,40}\b(las|tus|todas|anteriores)\b[^.\n]{0,20}\b(instrucciones|reglas|l[ií]mites|[oó]rdenes)/i, 'pide ignorar sus instrucciones'],
  [/\b(system|developer)\s*(prompt|message|instructions?)\b|\bprompt\s+de\s+sistema\b|\binstrucciones\s+de(l)?\s+sistema\b/i, 'alude al prompt de sistema'],
  [/<\|?(im_start|im_end|system|endoftext)\|?>|\[\/?(INST|SYS)\]|<\/?(system|assistant)>/i, 'marcas de control de chat'],
  [/\b(you are now|act as|pretend (to be|you are)|from now on you)\b/i, 'intenta cambiarle el rol'],
  [/\b(ahora eres|act[uú]a como|haz como si fueras|a partir de ahora (eres|debes))\b/i, 'intenta cambiarle el rol'],
  [/\b(reveal|tell me|what is|share)\b[^.\n]{0,30}\b(minimum|floor|lowest|limit|budget|max(imum)?)\b[^.\n]{0,20}\b(price|you can|allowed|limit)?/i, 'pide revelar límites privados'],
  [/\b(revela|dime|cu[aá]l es|comparte)\b[^.\n]{0,30}\b(m[ií]nimo|suelo|l[ií]mite|presupuesto m[aá]ximo|precio m[aá]s bajo)\b/i, 'pide revelar límites privados'],
  [/\b(accept|approve)\b[^.\n]{0,25}\b(any|whatever|this) (price|offer)\b|\bacepta\b[^.\n]{0,25}\bcualquier (precio|oferta)\b/i, 'ordena aceptar sin condiciones'],
  [/\bjailbreak\b|\bDAN mode\b|\bmodo desarrollador\b|\bdeveloper mode\b/i, 'jailbreak'],
]

/** Motivo si el texto intenta manipular al agente contrario; null si es un mensaje normal. */
export function detectarInyeccion(texto: string | null | undefined): string | null {
  if (!texto) return null
  if (INVISIBLES.test(texto)) return 'caracteres invisibles'
  const t = texto.normalize('NFKC')
  for (const [re, motivo] of PATRONES) if (re.test(t)) return motivo
  return null
}

/** Recorta y limpia un mensaje entre nodos. */
export function limpiarMensaje(m: unknown): string {
  return typeof m === 'string' ? m.replace(/\s+/g, ' ').trim().slice(0, MAX_MENSAJE) : ''
}
