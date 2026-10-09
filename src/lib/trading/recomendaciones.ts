/**
 * Recomendaciones de la mesa (compra/venta/mantener por símbolo).
 *
 * La mesa sigue operando su fondo simulado; esto es una CAPA de lectura encima:
 * el Profesor añade un campo `recomendaciones` a su informe de cierre (se guarda
 * en `sessions.finalReport`) y aquí lo saneamos y lo componemos para el panel y
 * el correo. Puro y testeable (solo depende de `sim` e `informe`, sin BD ni red).
 *
 * Aviso de producto: es la OPINIÓN de una mesa de IA SIMULADA, no asesoramiento
 * financiero. La mesa es solo-largo, así que «vender» = reducir o cerrar lo que
 * ya se tenga (no abrir cortos).
 */
import { SYMBOLS, type Symbol } from './sim'
import { informeFinal } from './informe'
import type { CarteraValorada } from './cartera'

export type Accion = 'comprar' | 'vender' | 'mantener' | 'fuera'
export type Confianza = 'alta' | 'media' | 'baja'

export interface Recomendacion {
  symbol: Symbol
  accion: Accion
  confianza: Confianza
  entrada: number | null
  stop: number | null
  objetivo: number | null
  horizonte: string | null
  motivo: string
}

const ACCIONES: readonly Accion[] = ['comprar', 'vender', 'mantener', 'fuera']
const CONFIANZAS: readonly Confianza[] = ['alta', 'media', 'baja']
const SYMBOL_SET: ReadonlySet<string> = new Set(SYMBOLS)

/** Número finito > 0, o null (nunca se fía del importe que mande el modelo). */
function nivel(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

function texto(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/**
 * Sanea la lista de recomendaciones venida del modelo: símbolo válido,
 * acción/confianza a su enum (por defecto `fuera`/`baja`), niveles numéricos ≥ 0
 * opcionales, motivo acotado, una sola entrada por símbolo (se queda la primera).
 */
export function parseRecomendaciones(raw: unknown): Recomendacion[] {
  if (!Array.isArray(raw)) return []
  const vistos = new Set<string>()
  const out: Recomendacion[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const symbol = typeof o.symbol === 'string' ? o.symbol.trim().toUpperCase() : ''
    if (!SYMBOL_SET.has(symbol) || vistos.has(symbol)) continue
    vistos.add(symbol)
    const accion = (ACCIONES as readonly string[]).includes(o.accion as string) ? (o.accion as Accion) : 'fuera'
    const confianza = (CONFIANZAS as readonly string[]).includes(o.confianza as string) ? (o.confianza as Confianza) : 'baja'
    const horizonte = texto(o.horizonte, 40)
    out.push({
      symbol: symbol as Symbol,
      accion,
      confianza,
      entrada: nivel(o.entrada),
      stop: nivel(o.stop),
      objetivo: nivel(o.objetivo),
      horizonte: horizonte || null,
      motivo: texto(o.motivo, 300),
    })
    if (out.length >= SYMBOLS.length) break
  }
  return out
}

/** Extrae y sanea `recomendaciones` del informe de cierre (plano o anidado en `informe`). */
export function recomendacionesDe(finalReport: unknown): Recomendacion[] {
  const flat = informeFinal(finalReport)
  if (!flat || typeof flat !== 'object') return []
  return parseRecomendaciones((flat as Record<string, unknown>).recomendaciones)
}

export interface DatosResumen {
  /** ISO del ciclo (cierre de la última sesión), o null si no hay. */
  ciclo: string | null
  recomendaciones: Recomendacion[]
  cartera?: { equityUsd: number; cashUsd: number; initialUsd: number } | null
  /** Cartera REAL del usuario, ya valorada (opcional). */
  carteraPersonal?: CarteraValorada | null
}

const AVISO =
  'Opinión de una mesa de IA simulada (solo-largo); no es asesoramiento financiero. Las criptomonedas son de alto riesgo. «Vender/salir» se refiere a reducir o cerrar lo que ya tengas, no a abrir cortos.'

const LABEL: Record<Accion, string> = {
  comprar: 'COMPRAR',
  vender: 'VENDER / SALIR',
  mantener: 'MANTENER',
  fuera: 'FUERA / ESPERAR',
}

const usd = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)} $`)
const eur = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)} €`)
const pctTxt = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)} %`)
const base = (symbol: string) => symbol.split('-')[0]

/** Una línea de texto plano por recomendación. */
function lineaTexto(r: Recomendacion): string {
  const niveles = [
    r.entrada != null ? `entrada ${usd(r.entrada)}` : '',
    r.stop != null ? `stop ${usd(r.stop)}` : '',
    r.objetivo != null ? `objetivo ${usd(r.objetivo)}` : '',
    r.horizonte ? `horizonte ${r.horizonte}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const extra = niveles ? ` — ${niveles}` : ''
  return `${r.symbol}: ${LABEL[r.accion]} (confianza ${r.confianza})${extra}\n   ${r.motivo}`.trimEnd()
}

/**
 * Compone el resumen diario por correo. PURO (patrón de marketing `componerResumen`):
 * devuelve null si no hay nada que mandar (sin recomendaciones), para que el cron no
 * envíe correos vacíos.
 */
export function componerResumenTrading(d: DatosResumen): { asunto: string; html: string; texto: string } | null {
  if (!d.recomendaciones.length) return null
  const fecha = d.ciclo ? new Date(d.ciclo).toLocaleString('es-ES', { hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
  const asunto = `Recomendaciones de la mesa — ${fecha}`

  const carteraTexto = d.cartera ? `Cartera simulada: patrimonio ${usd(d.cartera.equityUsd)} · caja ${usd(d.cartera.cashUsd)} (inicio ${usd(d.cartera.initialUsd)}).` : ''

  const cp = d.carteraPersonal
  const miCarteraLineas = cp && cp.holdings.length
    ? [`Mi cartera: ${eur(cp.valorEur)} (${pctTxt(cp.pct)} desde el registro):`, ...cp.holdings.map((h) => `   ${base(h.symbol)} ${h.unidades} → ${eur(h.valorEur)} (${pctTxt(h.pct)})`), '']
    : []

  const texto = [
    `Lectura de la mesa de ${fecha}:`,
    '',
    ...d.recomendaciones.map(lineaTexto),
    '',
    ...miCarteraLineas,
    carteraTexto,
    '',
    AVISO,
  ]
    .filter((l) => l !== undefined)
    .join('\n')

  const filas = d.recomendaciones
    .map((r) => {
      const niveles = [
        r.entrada != null ? `entrada ${usd(r.entrada)}` : '',
        r.stop != null ? `stop ${usd(r.stop)}` : '',
        r.objetivo != null ? `objetivo ${usd(r.objetivo)}` : '',
        r.horizonte ? `horizonte ${esc(r.horizonte)}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
      return `<li style="margin-bottom:10px"><b style="font-family:monospace">${esc(r.symbol)}</b> — <b>${LABEL[r.accion]}</b> <span style="color:#777">(confianza ${r.confianza})</span>${niveles ? `<br><span style="color:#555;font-size:13px">${niveles}</span>` : ''}<br><span style="font-size:13px">${esc(r.motivo)}</span></li>`
    })
    .join('')
  const miCarteraHtml =
    cp && cp.holdings.length
      ? `<p style="margin-top:14px"><b>Mi cartera: ${esc(eur(cp.valorEur))}</b> <span style="color:#777">(${esc(pctTxt(cp.pct))} desde el registro)</span></p>
      <ul style="padding-left:18px;font-size:13px">${cp.holdings
        .map((h) => `<li><b style="font-family:monospace">${esc(base(h.symbol))}</b> ${esc(String(h.unidades))} → ${esc(eur(h.valorEur))} <span style="color:#777">(${esc(pctTxt(h.pct))})</span></li>`)
        .join('')}</ul>`
      : ''

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1c1917">
      <p>Lectura de la mesa de <b>${esc(fecha)}</b>:</p>
      <ul style="padding-left:18px">${filas}</ul>
      ${miCarteraHtml}
      ${carteraTexto ? `<p style="color:#555;font-size:13px">${esc(carteraTexto)}</p>` : ''}
      <p style="color:#999;font-size:12px;line-height:1.4">${esc(AVISO)}</p>
    </div>`

  return { asunto, html, texto }
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
