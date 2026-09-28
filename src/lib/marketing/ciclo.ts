/**
 * Ciclo del dominio marketing: lo que hace el CÓDIGO alrededor de las mesas de la banda.
 *
 * - `abrirPlan`: sesión «plan» que propone temas (Tokio → Denver → Palermo → Helsinki, que los
 *   registra con `registrarTemas`, → Profesor, que cierra con su informe); quedan «propuesto»
 *   hasta que Javier los aprueba en el panel.
 * - `abrirRedaccion`: sesión «articulo» para un tema aprobado, con su hueco de publicación de la
 *   semana siguiente ya fijado.
 * - `enviarArticulo`: la herramienta de Helsinki. Exige la aprobación de Palermo y la validación
 *   en código de las dos versiones; manda ES y EN a WordNext (borradores enlazados, programados).
 * - `finalizarSesion`: al terminar una mesa, el tema pasa a su estado (vetado, fallido…).
 * - `aplicarAviso`: WordNext avisa de cada cambio de estado de una pieza (aprobada, publicada,
 *   rechazada con motivo) y el tema lo refleja.
 * - `cicloMarketing`: cron horario con el calendario semanal (ver calendario.ts).
 * Todo con dependencias inyectables: se prueba sin BD, sin red y sin modelos.
 */

import type { EstadoTema, Pieza, Tema } from '@/db/marketing'
import { leerVeredicto, validarArticulo, validarTemas, type ArticuloValido } from './articulo'
import { esDiaDePlan, esDiaDeRedaccion, esHoraDeResumen, haceDias, lunesSemanaSiguiente, madridAUtc, primerHuecoLibre } from './calendario'
import { articulosPorSemana, destinos, MARKETING_SESION_MAX_MS, modelosDisponibles, temasPorPlan } from './config'
import { leerInforme, resultadoDeCierre, type InformeProfesor } from './informe'
import type { MarketingStore, SesionAbierta } from './store'
import { claveTraduccion, enviarPieza, refPieza, type EnvioPieza, type ResultadoEnvio, type VistaPieza } from './wordnext'

export type TipoSesion = 'plan' | 'articulo'

export interface DepsCiclo {
  store: MarketingStore
  /** Abre la sesión del dominio y lanza su primer tick. Devuelve el id de sesión. */
  abrirSesion: (kind: TipoSesion, payload: Record<string, unknown>) => Promise<string>
  leerSesion: (id: string) => Promise<{ status: string; finalReport: unknown } | null>
  enviar?: (p: EnvioPieza) => Promise<ResultadoEnvio>
  enviarCorreo?: (correo: { asunto: string; html: string; texto: string }) => Promise<void>
  modelosOk?: () => boolean
  now?: () => number
  env?: Record<string, string | undefined>
}

const uuid = () => crypto.randomUUID()
const ahora = (deps: DepsCiclo) => new Date((deps.now ?? Date.now)())

// ─── Plan ──────────────────────────────────────────────────────────────────────

export type ResultadoPlan = { tipo: 'abierto'; sessionId: string } | { tipo: 'en-curso' } | { tipo: 'sin-modelos' }

export async function abrirPlan(destino: string, deps: DepsCiclo, abiertas?: SesionAbierta[]): Promise<ResultadoPlan> {
  const enCurso = (abiertas ?? (await deps.store.sesionesAbiertas())).some((s) => s.kind === 'plan' && s.payload.destino === destino)
  if (enCurso) return { tipo: 'en-curso' }
  if (!(deps.modelosOk ?? modelosDisponibles)()) return { tipo: 'sin-modelos' }
  const cuantos = temasPorPlan(deps.env)
  const sessionId = await deps.abrirSesion('plan', { kind: 'plan', destino, cuantos })
  return { tipo: 'abierto', sessionId }
}

/** Herramienta registrarTemas (Helsinki en un plan): valida en código e inserta los temas. */
export async function registrarTemas(payloadTarea: Record<string, unknown>, sessionId: string, input: unknown, deps: Pick<DepsCiclo, 'store' | 'now' | 'env'>) {
  const destino = typeof payloadTarea.destino === 'string' ? payloadTarea.destino : null
  if (payloadTarea.kind !== 'plan' || !destino) return { error: 'registrarTemas solo vale en una sesión de plan' }
  const ya = await deps.store.temasDesde(destino, new Date(0))
  if (ya.some((t) => t.planSessionId === sessionId)) return { error: 'los temas de este plan ya están registrados', registrados: ya.filter((t) => t.planSessionId === sessionId).length }
  const max = typeof payloadTarea.cuantos === 'number' ? payloadTarea.cuantos : temasPorPlan(deps.env)
  const existentes = await deps.store.titulosRecientes(destino, 200)
  const { temas, descartes } = validarTemas(input, max, existentes)
  const now = new Date((deps.now ?? Date.now)())
  for (const t of temas) {
    await deps.store.insertarTema({ id: uuid(), destino, ...t, estado: 'propuesto', planSessionId: sessionId, createdAt: now, updatedAt: now })
  }
  return { registrados: temas.length, descartes }
}

// ─── Redacción ─────────────────────────────────────────────────────────────────

export type ResultadoRedaccion = { tipo: 'abierta'; sessionId: string; programadoPara: Date } | { tipo: 'sin-hueco' } | { tipo: 'no-aprobado' } | { tipo: 'sin-modelos' } | { tipo: 'en-curso' }

/** Arranca la redacción de un tema APROBADO en el primer hueco libre de la semana siguiente. */
export async function abrirRedaccion(tema: Tema, deps: DepsCiclo): Promise<ResultadoRedaccion> {
  if (tema.estado !== 'aprobado') return { tipo: 'no-aprobado' }
  if (!(deps.modelosOk ?? modelosDisponibles)()) return { tipo: 'sin-modelos' }
  const now = ahora(deps)
  const porSemana = articulosPorSemana(deps.env)
  const l = lunesSemanaSiguiente(now)
  const lunes = madridAUtc(l.y, l.m, l.d, 0)
  const siguienteLunes = madridAUtc(l.y, l.m, l.d + 7, 0)
  const ocupados = (await deps.store.programadosEntre(tema.destino, lunes, siguienteLunes)).filter((t) => t.id !== tema.id).map((t) => t.programadoPara!)
  const hueco = primerHuecoLibre(now, porSemana, ocupados)
  if (!hueco) return { tipo: 'sin-hueco' }
  // Se marca ANTES de abrir la sesión: dos crons seguidos no abren dos mesas del mismo tema.
  await deps.store.actualizarTema(tema.id, { estado: 'redactando', programadoPara: hueco, motivo: null })
  const sessionId = await deps.abrirSesion('articulo', { kind: 'articulo', temaId: tema.id, version: tema.version, destino: tema.destino })
  await deps.store.actualizarTema(tema.id, { sessionId })
  return { tipo: 'abierta', sessionId, programadoPara: hueco }
}

/** Por qué «Redactar ahora» no abrió mesa, en claro para el panel. */
export async function porQueNoRedacta(deps: DepsCiclo): Promise<string> {
  if (!(deps.modelosOk ?? modelosDisponibles)()) return 'faltan las claves de los modelos (ANTHROPIC_API_KEY)'
  const redactando = await deps.store.temasEnEstado(['redactando'])
  if (redactando.length) return `ya hay una redacción en curso: «${redactando[0].titulo}»`
  const aprobados = await deps.store.temasEnEstado(['aprobado'])
  if (!aprobados.length) return 'no hay temas aprobados: aprueba alguno de los propuestos'
  return 'la semana siguiente ya tiene sus artículos programados (se redactará en la próxima)'
}

// ─── Envío a WordNext (herramienta de Helsinki) ────────────────────────────────

/** El campo más reciente del dossier que pasa la validación. */
function ultimo<T>(dossier: unknown[], campo: string, leer: (v: unknown) => T | null): T | null {
  for (const p of dossier) {
    const v = p && typeof p === 'object' ? (p as Record<string, unknown>)[campo] : undefined
    const r = leer(v)
    if (r !== null) return r
  }
  return null
}

export interface ResultadoEnvioArticulo {
  ok: boolean
  error?: string
  errores?: string[]
  piezas?: { locale: string; estado: string; reviewUrl: string | null }[]
}

export async function enviarArticulo(tema: Tema, dossier: unknown[], deps: Pick<DepsCiclo, 'store' | 'enviar' | 'now'>): Promise<ResultadoEnvioArticulo> {
  if (tema.estado === 'en_revision' || tema.estado === 'publicado') {
    const ya = await deps.store.piezasDeTema(tema.id, tema.version)
    return { ok: true, piezas: ya.map((p) => ({ locale: p.locale, estado: p.estado, reviewUrl: p.reviewUrl })) }
  }
  if (tema.estado !== 'redactando') return { ok: false, error: `el tema está «${tema.estado}», no en redacción` }

  const veredicto = ultimo(dossier, 'veredictoPalermo', leerVeredicto)
  if (!veredicto?.aprueba) {
    const motivo = veredicto ? `Palermo no aprueba: ${veredicto.motivos.join('; ') || 'sin motivos'}` : 'sin veredicto de Palermo en el dossier'
    return { ok: false, error: motivo }
  }
  const leer = (v: unknown) => {
    const r = validarArticulo(v)
    return r.ok ? r.articulo : null
  }
  const es = ultimo(dossier, 'articuloEs', leer)
  const en = ultimo(dossier, 'articuloEn', leer)
  if (!es || !en) {
    const errores = [
      ...(es ? [] : ['ES: ' + erroresDe(dossier, 'articuloEs').join('; ')]),
      ...(en ? [] : ['EN: ' + erroresDe(dossier, 'articuloEn').join('; ')]),
    ]
    return { ok: false, error: 'el artículo no pasa la validación en código', errores }
  }

  const enviar = deps.enviar ?? ((p: EnvioPieza) => enviarPieza(p))
  const piezas: ResultadoEnvioArticulo['piezas'] = []
  for (const [locale, art] of [['es', es], ['en', en]] as [string, ArticuloValido][]) {
    const externalRef = refPieza(tema.id, tema.version, locale)
    const r = await enviar({
      tenant: tema.destino,
      title: art.titulo,
      slug: art.slug,
      excerpt: art.extracto,
      seoTitle: art.seoTitulo,
      seoDescription: art.seoDescripcion,
      html: art.html,
      scheduledAt: tema.programadoPara ? tema.programadoPara.toISOString() : null,
      externalRef,
      locale,
      translationKey: claveTraduccion(tema.id),
    })
    if (!r.ok) {
      // ES pudo salir y EN no: el reintento reenvía las dos (idempotente por externalRef).
      return { ok: false, error: `envío ${locale.toUpperCase()} a WordNext: ${r.error}`, piezas }
    }
    const previa = await deps.store.pieza(externalRef)
    const datos = { wordnextId: r.vista.id, estado: r.vista.status, url: r.vista.url, reviewUrl: r.vista.reviewUrl, feedback: r.vista.feedback, scheduledAt: fecha(r.vista.scheduledAt) }
    if (previa) await deps.store.actualizarPieza(previa.id, datos)
    else await deps.store.insertarPieza({ id: uuid(), temaId: tema.id, version: tema.version, locale, titulo: art.titulo, externalRef, ...datos })
    piezas.push({ locale, estado: r.vista.status, reviewUrl: r.vista.reviewUrl })
  }
  await deps.store.actualizarTema(tema.id, { estado: 'en_revision', motivo: null })
  return { ok: true, piezas }
}

function erroresDe(dossier: unknown[], campo: string): string[] {
  for (const p of dossier) {
    const v = p && typeof p === 'object' ? (p as Record<string, unknown>)[campo] : undefined
    if (v === undefined) continue
    const r = validarArticulo(v)
    return r.ok ? [] : r.errores
  }
  return ['no está en el dossier']
}

const fecha = (s: string | null): Date | null => {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

// ─── Fin de una mesa ───────────────────────────────────────────────────────────

/** Tras cerrar una sesión: un tema aún «redactando» pasa a vetado o fallido con el motivo. */
export async function finalizarSesion(sessionId: string, deps: Pick<DepsCiclo, 'store' | 'leerSesion'>): Promise<EstadoTema | null> {
  const tema = await deps.store.temaPorSesion(sessionId)
  if (!tema || tema.estado !== 'redactando') return null
  const s = await deps.leerSesion(sessionId)
  if (!s || s.status === 'open') return null
  const cierre = resultadoDeCierre(s.finalReport)
  const estado: EstadoTema = s.status === 'vetoed' || cierre.resultado === 'vetado' ? 'vetado' : 'fallido'
  const motivo = (cierre.motivo || (s.status === 'failed' ? 'la mesa falló (proveedor o tiempo agotado)' : 'la mesa terminó sin enviar el artículo')).slice(0, 1000)
  await deps.store.actualizarTema(tema.id, { estado, motivo })
  return estado
}

// ─── Aviso de WordNext ─────────────────────────────────────────────────────────

/** Estado del tema según sus piezas (versión actual). */
export function estadoPorPiezas(piezas: Pick<Pieza, 'estado' | 'feedback' | 'locale'>[]): { estado: EstadoTema; motivo: string | null } {
  if (!piezas.length) return { estado: 'en_revision', motivo: null }
  const rechazada = piezas.find((p) => p.estado === 'rejected')
  if (rechazada) return { estado: 'rechazado', motivo: `${rechazada.locale.toUpperCase()}: ${rechazada.feedback ?? 'rechazado sin motivo'}` }
  if (piezas.some((p) => p.estado === 'cancelled')) return { estado: 'fallido', motivo: 'la entrada se borró o retiró en WordNext' }
  if (piezas.length >= 2 && piezas.every((p) => p.estado === 'published')) return { estado: 'publicado', motivo: null }
  return { estado: 'en_revision', motivo: null }
}

export async function aplicarAviso(vista: VistaPieza, deps: Pick<DepsCiclo, 'store'>): Promise<{ ok: boolean; temaId?: string; estado?: EstadoTema }> {
  const pieza = (await deps.store.piezaPorWordnext(vista.id)) ?? (vista.externalRef ? await deps.store.pieza(vista.externalRef) : null)
  if (!pieza) return { ok: false }
  await deps.store.actualizarPieza(pieza.id, {
    wordnextId: vista.id,
    estado: vista.status,
    url: vista.url,
    reviewUrl: vista.reviewUrl ?? pieza.reviewUrl,
    feedback: vista.feedback,
    scheduledAt: fecha(vista.scheduledAt),
    publishedAt: fecha(vista.publishedAt),
  })
  const tema = await deps.store.tema(pieza.temaId)
  if (!tema) return { ok: true }
  // Un aviso de una versión anterior (reescrita) no cambia el tema.
  if (pieza.version !== tema.version || !['en_revision', 'publicado', 'rechazado'].includes(tema.estado)) return { ok: true, temaId: tema.id, estado: tema.estado }
  const piezas = await deps.store.piezasDeTema(tema.id, tema.version)
  const { estado, motivo } = estadoPorPiezas(piezas)
  if (estado !== tema.estado || motivo !== tema.motivo) await deps.store.actualizarTema(tema.id, { estado, motivo })
  return { ok: true, temaId: tema.id, estado }
}

// ─── Decisiones de Javier (panel) ──────────────────────────────────────────────

export async function decidirTema(id: string, decision: 'aprobar' | 'descartar' | 'reescribir', nota: string | null, deps: Pick<DepsCiclo, 'store' | 'now'>): Promise<{ ok: boolean; error?: string }> {
  const t = await deps.store.tema(id)
  if (!t) return { ok: false, error: 'tema no encontrado' }
  const now = new Date((deps.now ?? Date.now)())
  const limpia = nota?.trim().slice(0, 1000) || null
  const cerrable = ['rechazado', 'vetado', 'fallido']
  if (decision === 'aprobar') {
    if (t.estado !== 'propuesto') return { ok: false, error: `solo se aprueba un tema propuesto (está «${t.estado}»)` }
    await deps.store.actualizarTema(id, { estado: 'aprobado', nota: limpia, decididoAt: now })
    return { ok: true }
  }
  if (decision === 'descartar') {
    if (t.estado !== 'propuesto' && t.estado !== 'aprobado' && !cerrable.includes(t.estado)) return { ok: false, error: `no se descarta un tema «${t.estado}»` }
    await deps.store.actualizarTema(id, { estado: 'descartado', nota: limpia ?? t.nota, decididoAt: now })
    return { ok: true }
  }
  if (!cerrable.includes(t.estado)) return { ok: false, error: `solo se reescribe un tema rechazado, vetado o fallido (está «${t.estado}»)` }
  // Versión nueva: externalRef distinto en WordNext; el hueco se vuelve a calcular.
  await deps.store.actualizarTema(id, { estado: 'aprobado', version: t.version + 1, nota: limpia ?? t.motivo, programadoPara: null, decididoAt: now })
  return { ok: true }
}

// ─── Resumen del domingo ───────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const fechaCorta = (d: Date | null) => (d ? d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'sin fecha')

export interface DatosResumen {
  enRevision: { tema: Tema; piezas: Pieza[] }[]
  propuestos: Tema[]
  problemas: Tema[]
  panelUrl: string | null
  /** Informes del Profesor por id de sesión (artículo o plan). Opcional. */
  informes?: Record<string, InformeProfesor>
}

function informeHtml(inf: InformeProfesor): string {
  const partes = [`<em>Profesor:</em> ${esc(inf.resumen)}`]
  if (inf.revisar.length) partes.push(`<br><em>Mira antes de aprobar:</em><ul>${inf.revisar.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`)
  if (inf.objeciones.length) partes.push(`<em>Objeciones de Palermo${inf.devoluciones ? ` (${inf.devoluciones} devolución/es)` : ''}:</em> ${esc(inf.objeciones.join(' · '))}<br>`)
  if (inf.fuentes.length) partes.push(`<em>Fuentes:</em> ${inf.fuentes.map((u, i) => `<a href="${esc(u)}">${i + 1}</a>`).join(' ')}`)
  return `<div style="margin:4px 0 10px;color:#444">${partes.join('')}</div>`
}

function informeTexto(inf: InformeProfesor): string[] {
  const l = [`  Profesor: ${inf.resumen}`]
  for (const r of inf.revisar) l.push(`  · Mira: ${r}`)
  if (inf.objeciones.length) l.push(`  · Objeciones: ${inf.objeciones.join(' · ')}`)
  if (inf.fuentes.length) l.push(`  · Fuentes: ${inf.fuentes.join(' ')}`)
  return l
}

/** Correo del domingo. Puro. */
export function componerResumen(d: DatosResumen): { asunto: string; html: string; texto: string } | null {
  const pendientes = d.enRevision.filter((x) => x.piezas.some((p) => p.estado === 'pending'))
  if (!pendientes.length && !d.propuestos.length && !d.problemas.length) return null
  const partes: string[] = []
  const texto: string[] = []
  if (pendientes.length) {
    partes.push(`<h2>Artículos por aprobar en WordNext (${pendientes.length})</h2><ul>`)
    texto.push(`Artículos por aprobar en WordNext (${pendientes.length}):`)
    for (const { tema, piezas } of pendientes) {
      const enlaces = piezas.filter((p) => p.reviewUrl).map((p) => `<a href="${esc(p.reviewUrl!)}">${p.locale.toUpperCase()}</a>`).join(' · ')
      const inf = tema.sessionId ? d.informes?.[tema.sessionId] : undefined
      partes.push(`<li><strong>${esc(tema.titulo)}</strong> — ${esc(fechaCorta(tema.programadoPara))} — ${enlaces}${inf ? informeHtml(inf) : ''}</li>`)
      texto.push(`- ${tema.titulo} (${fechaCorta(tema.programadoPara)}): ${piezas.map((p) => `${p.locale.toUpperCase()} ${p.reviewUrl ?? ''}`).join(' | ')}`)
      if (inf) texto.push(...informeTexto(inf))
    }
    partes.push('</ul>')
  }
  if (d.propuestos.length) {
    partes.push(`<h2>Temas propuestos para la semana que viene (${d.propuestos.length})</h2>`)
    texto.push('', `Temas propuestos (${d.propuestos.length}):`)
    const planes = [...new Set(d.propuestos.map((t) => t.planSessionId).filter((x): x is string => !!x))]
    for (const id of planes) {
      const inf = d.informes?.[id]
      if (!inf) continue
      partes.push(informeHtml(inf))
      texto.push(...informeTexto(inf))
    }
    partes.push('<ul>')
    for (const t of d.propuestos) {
      partes.push(`<li><strong>${esc(t.titulo)}</strong> <em>(${esc(t.categoria)})</em><br>${esc(t.angulo)}</li>`)
      texto.push(`- ${t.titulo} (${t.categoria}): ${t.angulo}`)
    }
    partes.push('</ul>')
    if (d.panelUrl) partes.push(`<p><a href="${esc(d.panelUrl)}">Aprobar o descartar temas en La Banda</a></p>`)
    if (d.panelUrl) texto.push(`Aprobar o descartar: ${d.panelUrl}`)
  }
  if (d.problemas.length) {
    partes.push(`<h2>Necesitan tu decisión (${d.problemas.length})</h2><ul>`)
    texto.push('', `Necesitan tu decisión (${d.problemas.length}):`)
    for (const t of d.problemas) {
      partes.push(`<li><strong>${esc(t.titulo)}</strong> — ${esc(t.estado)}: ${esc(t.motivo ?? '')}</li>`)
      texto.push(`- ${t.titulo} — ${t.estado}: ${t.motivo ?? ''}`)
    }
    partes.push('</ul>')
  }
  const asunto = `Revisión del domingo: ${pendientes.length} artículo(s) y ${d.propuestos.length} tema(s)`
  return { asunto, html: `<p>Esto es lo que espera tu revisión esta semana.</p>${partes.join('')}<p>— La Banda</p>`, texto: ['Esto es lo que espera tu revisión esta semana.', '', ...texto].join('\n') }
}

export async function datosResumen(deps: Pick<DepsCiclo, 'store' | 'env' | 'leerSesion'>): Promise<DatosResumen> {
  const enRevisionTemas = await deps.store.temasEnEstado(['en_revision'])
  const enRevision = await Promise.all(enRevisionTemas.map(async (tema) => ({ tema, piezas: await deps.store.piezasDeTema(tema.id, tema.version) })))
  const propuestos = await deps.store.temasEnEstado(['propuesto'])
  const problemas = await deps.store.temasEnEstado(['rechazado', 'vetado', 'fallido'])
  const app = (deps.env ?? process.env).APP_URL?.trim().replace(/\/$/, '')
  return { enRevision, propuestos, problemas, panelUrl: app ? `${app}/panel?tab=marketing` : null, informes: await informesDe([...enRevisionTemas.map((t) => t.sessionId), ...propuestos.map((t) => t.planSessionId)], deps) }
}

/** Informes del Profesor de esas sesiones (las que no tengan, se omiten). */
export async function informesDe(ids: (string | null)[], deps: Pick<DepsCiclo, 'leerSesion'>): Promise<Record<string, InformeProfesor>> {
  const out: Record<string, InformeProfesor> = {}
  for (const id of new Set(ids.filter((x): x is string => !!x))) {
    const inf = leerInforme((await deps.leerSesion(id))?.finalReport)
    if (inf) out[id] = inf
  }
  return out
}

// ─── Cron ──────────────────────────────────────────────────────────────────────

export interface ResultadoCiclo {
  finalizadas: number
  planes: string[]
  redacciones: string[]
  resumen: 'enviado' | 'vacio' | 'no-toca' | 'error'
}

/**
 * Cron horario. Siempre: cierra los temas de mesas terminadas. Jueves: plan por destino si no hay
 * uno esta semana. Jueves a sábado: UNA redacción por destino y hora mientras falten artículos
 * para la semana siguiente. Domingo 08:00: resumen por correo. `forzar` salta el calendario
 * (botones del panel).
 */
export async function cicloMarketing(deps: DepsCiclo, opts: { forzar?: 'plan' | 'redaccion' } = {}): Promise<ResultadoCiclo> {
  const now = ahora(deps)
  const res: ResultadoCiclo = { finalizadas: 0, planes: [], redacciones: [], resumen: 'no-toca' }

  // 1. Temas cuya mesa terminó sin que el tick los cerrara.
  for (const t of await deps.store.temasEnEstado(['redactando'])) {
    if (!t.sessionId) continue
    const s = await deps.leerSesion(t.sessionId)
    if (s && s.status !== 'open') {
      if (await finalizarSesion(t.sessionId, deps)) res.finalizadas++
    } else if (!s && t.updatedAt.getTime() < now.getTime() - MARKETING_SESION_MAX_MS) {
      await deps.store.actualizarTema(t.id, { estado: 'fallido', motivo: 'la sesión de redacción desapareció' })
      res.finalizadas++
    }
  }

  const abiertas = await deps.store.sesionesAbiertas()
  const porSemana = articulosPorSemana(deps.env)

  for (const destino of destinos(deps.env)) {
    // 2. Plan: jueves, si esta semana aún no se propuso nada y no quedan propuestos sin decidir de sobra.
    if (opts.forzar === 'plan' || (!opts.forzar && esDiaDePlan(now))) {
      const recientes = await deps.store.temasDesde(destino, haceDias(now, 6))
      const pendientes = (await deps.store.temasEnEstado(['propuesto'], destino)).length
      if (opts.forzar === 'plan' || (!recientes.some((t) => t.planSessionId) && pendientes < porSemana)) {
        const r = await abrirPlan(destino, deps, abiertas)
        if (r.tipo === 'abierto') res.planes.push(r.sessionId)
      }
    }
    // 3. Redacción: una mesa a la vez por destino.
    if (opts.forzar === 'redaccion' || (!opts.forzar && esDiaDeRedaccion(now))) {
      const redactando = (await deps.store.temasEnEstado(['redactando'], destino)).length
      if (redactando === 0) {
        const aprobados = await deps.store.temasEnEstado(['aprobado'], destino)
        if (aprobados.length) {
          const r = await abrirRedaccion(aprobados[0], deps)
          if (r.tipo === 'abierta') res.redacciones.push(r.sessionId)
        }
      }
    }
  }

  // 4. Resumen del domingo.
  if (!opts.forzar && esHoraDeResumen(now)) {
    try {
      const correo = componerResumen(await datosResumen(deps))
      if (!correo) res.resumen = 'vacio'
      else if (deps.enviarCorreo) {
        await deps.enviarCorreo(correo)
        res.resumen = 'enviado'
      }
    } catch (err) {
      console.error('[la-banda] resumen marketing', err)
      res.resumen = 'error'
    }
  }
  return res
}
