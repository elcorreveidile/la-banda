/**
 * Ciclo del dominio política: lo que hace el CÓDIGO alrededor de las mesas de la banda.
 *
 * - `abrirEdicion` / `abrirExtra` / `abrirBulo` / `abrirEnvio`: abren la sesión de una pieza.
 * - `enviarPieza`: la herramienta de Helsinki. Exige la aprobación de Palermo y la validación en
 *   código (veredicto con fuentes, sin HTML, sin cifras de sondeos en veda); manda la pieza
 *   PENDIENTE al sondeo, donde una persona la aprueba. Para un envío de visitante manda solo el veredicto.
 * - `finalizarSesion`: si la mesa termina sin enviar, la pieza pasa a vetada o fallida con su motivo.
 * - `aplicarAviso`: el sondeo avisa de cada cambio (aprobada, publicada, rechazada) y la pieza lo refleja.
 * - `cicloPolitica`: cron horario: abre las ediciones que tocan y recoge los envíos de visitantes.
 * Todo con dependencias inyectables: se prueba sin BD, sin red y sin modelos.
 */

import { normalizarPayload } from '@/engine/decision'
import type { EstadoPoliticaPieza, PiezaPolitica, TipoPoliticaPieza } from '@/db/politica'
import { leerVeredicto } from '@/lib/marketing/articulo'
import { resultadoDeCierre } from '@/lib/marketing/informe'
import type { VistaPieza } from '@/lib/marketing/wordnext'
import { diaMadrid, edicionesDebidas, publicaEn, vigiaDebida, type EdicionId } from './calendario'
import { rangoEdiciones, modelosDisponibles, vigiaActivo } from './config'
import {
  enviarAlSondeo,
  enviarVerificacion,
  traerEnvios,
  type EnvioPolitica,
  type EnvioVisitante,
  type RespuestaPieza,
  type ResultadoLlamada,
} from './cliente'
import { ultimoDelDossier, validarPieza, validarVerificacion, type Verificacion } from './pieza'
import type { PoliticaStore } from './store'

export type TipoSesion = TipoSesionPolitica
type TipoSesionPolitica = 'edicion' | 'extra' | 'bulo' | 'envio' | 'vigia'

export interface DepsPolitica {
  store: PoliticaStore
  /** Abre la sesión del dominio y lanza su primer tick. Devuelve el id de sesión. */
  abrirSesion: (kind: TipoSesionPolitica, payload: Record<string, unknown>) => Promise<string>
  leerSesion: (id: string) => Promise<{ status: string; finalReport: unknown } | null>
  enviar?: (p: EnvioPolitica) => Promise<ResultadoLlamada<RespuestaPieza>>
  verificar?: (ref: string, v: { verdict: Verificacion['veredicto']; summary: string; sources: { titulo: string; url: string }[]; checkedAt: string }) => Promise<ResultadoLlamada<RespuestaPieza>>
  envios?: () => Promise<ResultadoLlamada<EnvioVisitante[]>>
  modelosOk?: () => boolean
  now?: () => number
  env?: Record<string, string | undefined>
  uuid?: () => string
}

const nuevoId = (d: Pick<DepsPolitica, 'uuid'>) => (d.uuid ?? (() => crypto.randomUUID()))()
const corto = (id: string) => id.replace(/-/g, '').slice(0, 8)
const ahora = (d: Pick<DepsPolitica, 'now'>) => new Date((d.now ?? Date.now)())

export type ResultadoApertura = { tipo: 'abierta'; id: string; sessionId: string } | { tipo: 'ya-abierta' } | { tipo: 'sin-modelos' }

async function abrir(pieza: Omit<Parameters<PoliticaStore['insertar']>[0], 'id' | 'estado'>, deps: DepsPolitica): Promise<ResultadoApertura> {
  if (!(deps.modelosOk ?? modelosDisponibles)()) return { tipo: 'sin-modelos' }
  const id = nuevoId(deps)
  // El índice único de externalRef es el cerrojo: si otra ejecución ya abrió esta pieza, aquí se para.
  const fila = await deps.store.insertar({ ...pieza, id, estado: 'en_curso' })
  if (!fila) return { tipo: 'ya-abierta' }
  try {
    const sessionId = await deps.abrirSesion(pieza.tipo as TipoSesionPolitica, { kind: pieza.tipo, piezaId: id })
    await deps.store.actualizar(id, { sessionId })
    return { tipo: 'abierta', id, sessionId }
  } catch (err) {
    await deps.store.actualizar(id, { estado: 'fallida', motivo: `no se pudo abrir la mesa: ${err instanceof Error ? err.message : String(err)}`.slice(0, 1000) })
    throw err
  }
}

export const refEdicion = (dia: string, edicion: string, version = 1) => `29n:${dia}:${edicion}:v${version}`

export function abrirEdicion(dia: string, edicion: EdicionId, deps: DepsPolitica, version = 1) {
  return abrir({ tipo: 'edicion', edicion, dia, externalRef: refEdicion(dia, edicion, version), version, programadoPara: publicaEn(dia, edicion) }, deps)
}

export function abrirExtra(input: { edicion: 'madrugada' | 'extra'; encargo: string }, deps: DepsPolitica) {
  const now = ahora(deps)
  const dia = diaMadrid(now)
  return abrir(
    { tipo: 'extra', edicion: input.edicion, dia, externalRef: `29n:${dia}:${input.edicion}:${corto(nuevoId(deps))}`, encargo: input.encargo.trim().slice(0, 2000), programadoPara: null },
    deps,
  )
}

/** Una ronda del vigía: revisa las fuentes aprobadas desde la ronda anterior. Sin novedad, se archiva sola. */
export function abrirVigia(dia: string, hora: number, deps: DepsPolitica) {
  const hh = String(hora).padStart(2, '0')
  return abrir(
    {
      tipo: 'vigia',
      edicion: 'extra',
      dia,
      externalRef: `29n:vigia:${dia}:${hh}`,
      encargo: `Ronda de vigilancia de las ${hh}:00 (hora de Madrid) del ${dia}: busca en las fuentes aprobadas lo que haya cambiado desde la ronda anterior.`,
      programadoPara: null,
    },
    deps,
  )
}

/** Ronda del vigía lanzada a mano desde el panel: clave propia (día, hora y minuto) para no chocar con la horaria. */
export function abrirVigiaManual(dia: string, now: Date, deps: DepsPolitica) {
  const hhmm = now.toISOString().slice(11, 16).replace(':', '')
  return abrir(
    {
      tipo: 'vigia',
      edicion: 'extra',
      dia,
      externalRef: `29n:vigia:${dia}:m${hhmm}`,
      encargo: `Ronda de vigilancia lanzada a mano por Javier el ${dia}: busca en las fuentes aprobadas lo que haya cambiado en las últimas horas.`,
      programadoPara: null,
    },
    deps,
  )
}

export function abrirBulo(afirmacion: string, deps: DepsPolitica) {
  const dia = diaMadrid(ahora(deps))
  return abrir({ tipo: 'bulo', edicion: 'extra', dia, externalRef: `29n:bulo:${corto(nuevoId(deps))}`, encargo: afirmacion.trim().slice(0, 2000), programadoPara: null }, deps)
}

export function abrirEnvio(envio: EnvioVisitante, deps: DepsPolitica) {
  const dia = diaMadrid(ahora(deps))
  const cuerpo = [envio.titulo, envio.texto, envio.enlaces.length ? `Enlaces aportados:\n${envio.enlaces.join('\n')}` : ''].filter(Boolean).join('\n\n')
  return abrir(
    { tipo: 'envio', edicion: null, dia, externalRef: `29n:envio:${envio.ref}`, envioRef: envio.ref, titulo: envio.titulo.slice(0, 200), encargo: cuerpo.slice(0, 4500), programadoPara: null },
    deps,
  )
}

/** Reescribir una pieza rechazada, vetada o fallida: versión + 1, con la nota de Javier. */
export async function reescribir(id: string, nota: string | null, deps: DepsPolitica): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
  const p = await deps.store.pieza(id)
  if (!p) return { ok: false, error: 'pieza no encontrada' }
  if (!['rechazada', 'vetada', 'fallida'].includes(p.estado)) return { ok: false, error: `una pieza «${p.estado}» no se reescribe` }
  if (p.tipo === 'envio') return { ok: false, error: 'un envío de visitante no se reescribe: se vuelve a verificar desde cero con «Abrir de nuevo»' }
  if (!(deps.modelosOk ?? modelosDisponibles)()) return { ok: false, error: 'sin claves de modelo' }
  const version = p.version + 1
  const externalRef = p.tipo === 'edicion' ? refEdicion(p.dia, p.edicion ?? '', version) : `${p.externalRef.replace(/\.v\d+$/, '')}.v${version}`
  await deps.store.actualizar(id, { estado: 'en_curso', version, externalRef, nota: nota?.trim().slice(0, 1000) || null, motivo: null, remotoId: null, url: null, reviewUrl: null, veredicto: null })
  try {
    const sessionId = await deps.abrirSesion(p.tipo, { kind: p.tipo, piezaId: id })
    await deps.store.actualizar(id, { sessionId })
    return { ok: true, sessionId }
  } catch (err) {
    await deps.store.actualizar(id, { estado: 'fallida', motivo: `no se pudo abrir la mesa: ${err instanceof Error ? err.message : String(err)}`.slice(0, 1000) })
    return { ok: false, error: 'no se pudo abrir la mesa' }
  }
}

// ─── Envío al sondeo (herramienta de Helsinki) ─────────────────────────────────

export interface ResultadoEnvioPieza {
  ok: boolean
  error?: string
  errores?: string[]
  veredicto?: string
  reviewUrl?: string | null
  avisos?: string[]
}

export async function enviarPieza(
  p: PiezaPolitica,
  dossier: unknown[],
  deps: Pick<DepsPolitica, 'store' | 'enviar' | 'verificar' | 'now'>,
): Promise<ResultadoEnvioPieza> {
  if (p.estado === 'enviada' || p.estado === 'aprobada' || p.estado === 'publicada') return { ok: true, veredicto: p.veredicto ?? undefined, reviewUrl: p.reviewUrl }
  if (p.estado !== 'en_curso') return { ok: false, error: `la pieza está «${p.estado}», no en curso` }

  const palermo = ultimoDelDossier(dossier, 'veredictoPalermo', leerVeredicto)
  if (!palermo?.aprueba) {
    return { ok: false, error: palermo ? `Palermo no aprueba: ${palermo.motivos.join('; ') || 'sin motivos'}` : 'sin veredicto de Palermo en el dossier' }
  }
  const checkedAt = ahora(deps).toISOString()

  if (p.tipo === 'envio') {
    const ver = ultimoDelDossier(dossier, 'verificacion', (v) => {
      const r = validarVerificacion(v)
      return r.ok ? r.verificacion : null
    })
    if (!ver || !p.envioRef) return { ok: false, error: 'verificación no válida', errores: [errorDeVerificacion(dossier)] }
    const r = await (deps.verificar ?? ((ref, v) => enviarVerificacion(ref, v)))(p.envioRef, {
      verdict: ver.veredicto,
      summary: ver.resumen,
      sources: ver.fuentes,
      checkedAt,
    } as never)
    if (!r.ok) return { ok: false, error: `veredicto al sondeo: ${r.error}` }
    await deps.store.actualizar(p.id, { estado: 'enviada', veredicto: ver.veredicto, titulo: p.titulo, remotoId: r.data.id, reviewUrl: r.data.reviewUrl, motivo: null })
    return { ok: true, veredicto: ver.veredicto, reviewUrl: r.data.reviewUrl, avisos: r.data.warnings }
  }

  // Un extra o un bulo no tienen hora fija: salen al aprobarse, así que se juzgan con la hora de ahora (veda incluida).
  const opciones = { tipo: p.tipo as TipoPoliticaPieza, programadoPara: p.programadoPara ?? ahora(deps) }
  const pieza = ultimoDelDossier(dossier, 'pieza', (v) => {
    const r = validarPieza(v, opciones)
    return r.ok ? r.pieza : null
  })
  if (!pieza) return { ok: false, error: 'la pieza no pasa la validación en código', errores: erroresDePieza(dossier, opciones) }

  const r = await (deps.enviar ?? enviarAlSondeo)({
    title: pieza.titulo,
    slug: pieza.slug,
    excerpt: pieza.extracto,
    markdown: pieza.markdown,
    externalRef: p.externalRef,
    scheduledAt: p.programadoPara ? p.programadoPara.toISOString() : null,
    edition: p.edicion,
    kind: 'noticia',
    verification: {
      verdict: pieza.verificacion.veredicto,
      summary: pieza.verificacion.resumen,
      sources: pieza.verificacion.fuentes,
      checkedAt,
    },
  })
  if (!r.ok) return { ok: false, error: `envío al sondeo: ${r.error}` }
  await deps.store.actualizar(p.id, {
    estado: 'enviada',
    titulo: pieza.titulo,
    veredicto: pieza.verificacion.veredicto,
    remotoId: r.data.id,
    reviewUrl: r.data.reviewUrl,
    url: r.data.url,
    motivo: null,
  })
  return { ok: true, veredicto: pieza.verificacion.veredicto, reviewUrl: r.data.reviewUrl, avisos: r.data.warnings }
}

function erroresDePieza(dossier: unknown[], o: Parameters<typeof validarPieza>[1]): string[] {
  for (const p of dossier) {
    const e = normalizarPayload(p)
    const v = e && typeof e === 'object' ? normalizarPayload((e as Record<string, unknown>).pieza) : undefined
    if (v === undefined) continue
    const r = validarPieza(v, o)
    return r.ok ? [] : r.errores
  }
  return ['no está en el dossier']
}

function errorDeVerificacion(dossier: unknown[]): string {
  for (const p of dossier) {
    const e = normalizarPayload(p)
    const v = e && typeof e === 'object' ? normalizarPayload((e as Record<string, unknown>).verificacion) : undefined
    if (v === undefined) continue
    const r = validarVerificacion(v)
    return r.ok ? '' : r.errores.join('; ')
  }
  return 'no está en el dossier'
}

// ─── Fin de una mesa ───────────────────────────────────────────────────────────

/** Tras cerrar una sesión: una pieza aún «en curso» pasa a vetada o fallida con el motivo. */
export async function finalizarSesion(sessionId: string, deps: Pick<DepsPolitica, 'store' | 'leerSesion'>): Promise<EstadoPoliticaPieza | null> {
  const p = await deps.store.piezaPorSesion(sessionId)
  if (!p || p.estado !== 'en_curso') return null
  const s = await deps.leerSesion(sessionId)
  if (!s || s.status === 'open') return null
  const cierre = resultadoDeCierre(s.finalReport)
  // Una ronda del vigía sin novedad no es un fallo: se archiva con su motivo y no ensucia el panel.
  if (p.tipo === 'vigia' && s.status !== 'failed' && s.status !== 'vetoed' && cierre.resultado === 'sin_novedad') {
    await deps.store.actualizar(p.id, { estado: 'archivada', motivo: (cierre.motivo || 'sin novedad en las fuentes').slice(0, 1000) })
    return 'archivada'
  }
  const estado: EstadoPoliticaPieza = s.status === 'vetoed' || cierre.resultado === 'vetado' ? 'vetada' : 'fallida'
  const motivo = (cierre.motivo || (s.status === 'failed' ? 'la mesa falló (proveedor o tiempo agotado)' : 'la mesa terminó sin enviar la pieza')).slice(0, 1000)
  await deps.store.actualizar(p.id, { estado, motivo })
  return estado
}

// ─── Aviso del sondeo ──────────────────────────────────────────────────────────

const ESTADO_REMOTO: Record<VistaPieza['status'], EstadoPoliticaPieza> = {
  pending: 'enviada',
  approved: 'aprobada',
  published: 'publicada',
  rejected: 'rechazada',
  cancelled: 'fallida',
}

export async function aplicarAviso(vista: VistaPieza, deps: Pick<DepsPolitica, 'store'>): Promise<{ ok: boolean; piezaId?: string; estado?: EstadoPoliticaPieza }> {
  const p =
    (await deps.store.piezaPorRemoto(vista.id)) ??
    (vista.externalRef ? ((await deps.store.piezaPorRef(vista.externalRef)) ?? (await deps.store.piezaPorRef(`29n:envio:${vista.externalRef}`))) : null)
  if (!p) return { ok: false }
  // Un aviso tardío de una versión anterior (reescrita) no pisa a la actual.
  if (p.estado === 'en_curso' || p.estado === 'archivada') return { ok: true, piezaId: p.id, estado: p.estado }
  const estado = ESTADO_REMOTO[vista.status]
  await deps.store.actualizar(p.id, {
    estado,
    remotoId: vista.id,
    url: vista.url ?? p.url,
    reviewUrl: vista.reviewUrl ?? p.reviewUrl,
    motivo: vista.status === 'rejected' ? (vista.feedback ?? 'rechazada sin motivo').slice(0, 1000) : vista.status === 'cancelled' ? 'la entrada se retiró en el sondeo' : null,
  })
  return { ok: true, piezaId: p.id, estado }
}

// ─── Cron ──────────────────────────────────────────────────────────────────────

export interface ResultadoCiclo {
  ediciones: { dia: string; edicion: string; resultado: string }[]
  vigia: { hora: number; resultado: string } | null
  envios: { abiertos: number; error?: string }
  sondeoConfigurado: boolean
}

const MAX_ENVIOS_POR_CICLO = 3

export async function cicloPolitica(deps: DepsPolitica, opts: { forzarEdicion?: EdicionId } = {}): Promise<ResultadoCiclo> {
  const now = ahora(deps)
  const dia = diaMadrid(now)
  const existentes = await deps.store.delDia(dia)
  const ocupadas = new Set(existentes.filter((p) => p.tipo === 'edicion').map((p) => `${p.dia}:${p.edicion}`))
  const debidas = edicionesDebidas(now, ocupadas, rangoEdiciones(deps.env))
  if (opts.forzarEdicion && !ocupadas.has(`${dia}:${opts.forzarEdicion}`) && !debidas.some((d) => d.edicion === opts.forzarEdicion)) {
    debidas.push({ dia, edicion: opts.forzarEdicion, programadoPara: publicaEn(dia, opts.forzarEdicion) })
  }
  const ediciones: ResultadoCiclo['ediciones'] = []
  for (const d of debidas) {
    try {
      const r = await abrirEdicion(d.dia, d.edicion, deps)
      ediciones.push({ dia: d.dia, edicion: d.edicion, resultado: r.tipo })
    } catch (err) {
      console.error('[la-banda] politica abrirEdicion', d.dia, d.edicion, err)
      ediciones.push({ dia: d.dia, edicion: d.edicion, resultado: 'error' })
    }
  }

  // Vigía horario: solo con POLITICA_VIGIA=1 (Javier aprueba antes la lista de fuentes).
  let vigia: ResultadoCiclo['vigia'] = null
  if (vigiaActivo(deps.env)) {
    const ocupadasVigia = new Set(existentes.filter((p) => p.tipo === 'vigia').map((p) => p.externalRef.replace(/^29n:vigia:/, '').replace(/:0?(\d+)$/, ':$1')))
    const v = vigiaDebida(now, ocupadasVigia, rangoEdiciones(deps.env))
    if (v) {
      try {
        const r = await abrirVigia(v.dia, v.hora, deps)
        vigia = { hora: v.hora, resultado: r.tipo }
      } catch (err) {
        console.error('[la-banda] politica abrirVigia', v.dia, v.hora, err)
        vigia = { hora: v.hora, resultado: 'error' }
      }
    }
  }

  const envios: ResultadoCiclo['envios'] = { abiertos: 0 }
  const traer = deps.envios ?? (() => traerEnvios({ env: deps.env }))
  const lista = await traer()
  if (!lista.ok) envios.error = lista.error
  else {
    for (const e of lista.data) {
      if (envios.abiertos >= MAX_ENVIOS_POR_CICLO) break
      if (await deps.store.piezaPorRef(`29n:envio:${e.ref}`)) continue
      try {
        const r = await abrirEnvio(e, deps)
        if (r.tipo === 'abierta') envios.abiertos++
      } catch (err) {
        console.error('[la-banda] politica abrirEnvio', e.ref, err)
      }
    }
  }
  return { ediciones, vigia, envios, sondeoConfigurado: !(!lista.ok && lista.error.startsWith('sondeo no configurado')) }
}
