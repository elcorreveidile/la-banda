'use server'

import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { auth } from '@/lib/auth'
import { engine } from '@/engine'
import { getDomain } from '@domains/index'
import { runTradingCycle } from '@/lib/trading/cycle'
import { kickTick, selfOrigin } from '@/engine/tick'
import { headers } from 'next/headers'
import { createManuscript, fileToText, setVersionSession } from '@/lib/olvidos/manuscripts'
import { getSection } from '@domains/olvidos/secciones'
import { CORPUS_DOMAIN, abrirMuestra, type MuestraInput } from '@/lib/corpus/cycle'
import { bombear } from '@/lib/bomba'
import { NIVELES, type Nivel } from '@domains/corpus-ele/config'
import { createPeticion, setPeticionSesion } from '@/lib/peticiones/peticiones'
import { createSite, setSiteSesion } from '@/lib/sitios/sites'
import { cicloMarketing, decidirLote, decidirTema, redactarTema, type Decision } from '@/lib/marketing/ciclo'
import { filtroDeQuery, queryVista } from '@/lib/marketing/vista'
import { depsMarketing } from '@/lib/marketing/deps'
import { marketingStoreDb } from '@/lib/marketing/store'
import { abrirBulo, abrirExtra, abrirVigiaManual, cicloPolitica, reescribir } from '@/lib/politica/ciclo'
import { depsPolitica } from '@/lib/politica/deps'
import { politicaStoreDb } from '@/lib/politica/store'
import { diaMadrid, EDICIONES, type EdicionId } from '@/lib/politica/calendario'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { cryptoCartera } from '@/db/trading'
import { CARTERA_SIMBOLOS, cierreEnVivo, valorarCartera, registrarSnapshotCartera, type CarteraSimbolo } from '@/lib/trading/cartera'
import { parsePerfil, guardarPerfilDb } from '@/lib/trading/perfil'

/** Lanza un ciclo de trading a mano (mismo camino que el cron) y arranca la cadena de ticks. */
export async function startTradingCycle() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  const h = await headers()
  const origin = process.env.APP_URL?.trim() || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`
  const result = await runTradingCycle(session.user.email)

  after(async () => {
    for (const id of [result.sessionId, ...result.resume]) {
      try {
        await kickTick(selfOrigin(origin), 'trading', id)
      } catch (err) {
        console.error('[la-banda] kickTick', id, err)
      }
    }
  })

  redirect(`/panel?s=${result.sessionId}`)
}

/** Envía un manuscrito a la redacción de Olvidos: lo guarda (versión 1), abre la sesión y arranca los ticks. */
export async function submitManuscript(formData: FormData) {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  const title = String(formData.get('title') ?? '').trim().slice(0, 200)
  const byline = String(formData.get('byline') ?? '').trim().slice(0, 120) || null
  const sectionKey = String(formData.get('section') ?? '').trim()
  if (!title || !getSection(sectionKey)) redirect('/panel')

  const file = formData.get('file')
  let text = String(formData.get('text') ?? '').trim()
  let format: 'md' | 'docx' | 'txt' = 'md'
  let sourceName: string | null = null
  if (file instanceof File && file.size > 0) {
    const parsed = await fileToText(file)
    text = parsed.text
    format = parsed.format
    sourceName = file.name
  }
  if (!text) redirect('/panel')

  const { manuscript, version } = await createManuscript({ title, byline, section: sectionKey, format, sourceName, text, createdBy: session.user.email })

  const domain = getDomain('olvidos')
  const opened = await engine.openSession(domain, {
    kind: 'manuscrito',
    createdBy: session.user.email,
    payload: { manuscriptId: manuscript.id, versionId: version.id, titulo: title, firma: byline, seccion: sectionKey, version: version.number, palabras: version.wordCount },
  })
  await setVersionSession(version.id, opened.session.id)

  const h = await headers()
  const origin = process.env.APP_URL?.trim() || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`
  after(async () => {
    try {
      await kickTick(selfOrigin(origin), 'olvidos', opened.session.id)
    } catch (err) {
      console.error('[la-banda] kickTick', opened.session.id, err)
    }
  })

  redirect(`/panel?s=${opened.session.id}`)
}

const TIPOS_MUESTRA: MuestraInput['tipo'][] = ['muestra_habla', 'texto_situado', 'transcripcion_oral', 'texto_escrito']

/** Encarga una muestra del corpus ELE (cadena A): abre la sesión y arranca los ticks. */
export async function startCorpusMuestra(formData: FormData) {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  const situacion = String(formData.get('situacion') ?? '').trim().slice(0, 120)
  const nivel = String(formData.get('nivel') ?? '').trim()
  const tipo = String(formData.get('tipo') ?? 'muestra_habla').trim()
  const notas = String(formData.get('notas') ?? '').trim().slice(0, 1000) || null
  if (situacion.length < 2 || !(NIVELES as readonly string[]).includes(nivel) || !(TIPOS_MUESTRA as string[]).includes(tipo)) redirect('/panel')

  const opened = await abrirMuestra({ situacion, nivel: nivel as Nivel, tipo: tipo as MuestraInput['tipo'], notas }, session.user.email)

  const h = await headers()
  const origin = process.env.APP_URL?.trim() || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`
  after(async () => {
    try {
      await kickTick(selfOrigin(origin), CORPUS_DOMAIN, opened.session.id)
    } catch (err) {
      console.error('[la-banda] kickTick', opened.session.id, err)
    }
  })

  redirect(`/panel?s=${opened.session.id}`)
}

/** Encarga un análisis libre: la banda analiza la petición y entrega un informe. */
export async function startPeticion(formData: FormData) {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  const titulo = String(formData.get('titulo') ?? '').trim().slice(0, 200)
  const texto = String(formData.get('texto') ?? '').trim().slice(0, 20_000)
  const webhookUrl = String(formData.get('webhookUrl') ?? '').trim().slice(0, 500) || null
  if (titulo.length < 1 || texto.length < 10) redirect('/panel')
  if (webhookUrl && !webhookUrl.startsWith('https://') && process.env.NODE_ENV === 'production') redirect('/panel')

  const peticion = await createPeticion({ titulo, texto, webhookUrl, referencia: null, createdBy: session.user.email })
  const domain = getDomain('peticiones')
  const opened = await engine.openSession(domain, {
    kind: 'peticion',
    createdBy: session.user.email,
    payload: { kind: 'peticion', peticionId: peticion.id, titulo: peticion.titulo },
  })
  await setPeticionSesion(peticion.id, opened.session.id)

  const h = await headers()
  const origin = process.env.APP_URL?.trim() || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`
  after(async () => {
    try {
      await kickTick(selfOrigin(origin), 'peticiones', opened.session.id)
    } catch (err) {
      console.error('[la-banda] kickTick', opened.session.id, err)
    }
  })

  redirect(`/panel?s=${opened.session.id}`)
}

const SUBDOMINIO_PANEL = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Encarga un sitio web: la banda lo construye desde el brief y lo entrega (WordNext o paquete estático). */
export async function startSitio(formData: FormData) {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  const titulo = String(formData.get('titulo') ?? '').trim().slice(0, 200)
  const modo = String(formData.get('modo') ?? '') === 'estatico' ? 'estatico' : 'wordnext'
  const alcance = String(formData.get('alcance') ?? '') === 'paginas' ? 'paginas' : 'sitio'
  const brief = String(formData.get('brief') ?? '').trim().slice(0, 40_000)
  const tenantId = String(formData.get('tenantId') ?? '').trim().slice(0, 120) || null
  const subdominio = String(formData.get('subdominio') ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 63) || null
  if (titulo.length < 1 || brief.length < 10) redirect('/panel?tab=sitios')
  if (alcance === 'paginas' && !tenantId) redirect('/panel?tab=sitios')
  if (alcance === 'sitio' && tenantId) redirect('/panel?tab=sitios')
  if (subdominio && (alcance !== 'sitio' || !SUBDOMINIO_PANEL.test(subdominio))) redirect('/panel?tab=sitios')

  const site = await createSite({ titulo, modo, alcance, brief, tenantId, subdominio, createdBy: session.user.email })
  const domain = getDomain('sitios')
  const opened = await engine.openSession(domain, {
    kind: 'sitio',
    createdBy: session.user.email,
    payload: { kind: 'sitio', sitioId: site.id, titulo: site.titulo, modo: site.modo, alcance: site.alcance },
  })
  await setSiteSesion(site.id, opened.session.id)

  const h = await headers()
  const origin = process.env.APP_URL?.trim() || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`
  after(async () => {
    try {
      await kickTick(selfOrigin(origin), 'sitios', opened.session.id)
    } catch (err) {
      console.error('[la-banda] kickTick', opened.session.id, err)
    }
  })

  redirect(`/panel?tab=sitios&s=${opened.session.id}`)
}

/**
 * Reanuda las sesiones colgadas: un ciclo de la bomba de ticks (igual que el cron de cada
 * minuto) con la sesión del usuario, sin CRON_SECRET. Lleva al panel de la primera sesión
 * a la que se lanzó un tick.
 */
export async function resumeStalledSessions(formData: FormData) {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  const nombre = String(formData.get('domain') ?? '').trim()
  const dominios = nombre ? [getDomain(nombre)] : undefined

  const h = await headers()
  const origin = process.env.APP_URL?.trim() || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`
  const r = await bombear(selfOrigin(origin), dominios)
  const primera = r.kicked[0]?.split(':').slice(1).join(':')

  redirect(primera ? `/panel?s=${primera}` : '/panel')
}

/** Adónde volver tras una acción de Marketing: la pestaña con el mismo filtro (web, búsqueda, archivados, «ver más»). */
function volverMarketing(formData: FormData, extra: Record<string, string> = {}): string {
  return `/panel?${queryVista(filtroDeQuery(String(formData.get('volver') ?? '')), extra)}`
}

/** Marketing: aprobar, descartar, archivar, borrar o pedir reescritura de un tema (Javier, en su revisión del domingo). */
async function decidirTemaMarketing(decision: Decision, formData: FormData) {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
  const id = String(formData.get('id') ?? '')
  const nota = String(formData.get('nota') ?? '')
  if (!id) redirect(volverMarketing(formData, { error: 'falta el tema' }))
  const r = await decidirTema(id, decision, nota, { store: marketingStoreDb })
  redirect(volverMarketing(formData, r.ok ? {} : { error: r.error ?? 'error' }))
}

/**
 * Marketing: una acción por botón (via `formAction`). No se lee el botón pulsado del FormData:
 * el envío de la acción de servidor no incluye el botón pulsado: la decisión llegaba vacía y la
 * acción no hacía nada.
 */
export async function aprobarTemaMarketing(formData: FormData) {
  await decidirTemaMarketing('aprobar', formData)
}
export async function descartarTemaMarketing(formData: FormData) {
  await decidirTemaMarketing('descartar', formData)
}
export async function reescribirTemaMarketing(formData: FormData) {
  await decidirTemaMarketing('reescribir', formData)
}
export async function archivarTemaMarketing(formData: FormData) {
  await decidirTemaMarketing('archivar', formData)
}
export async function desarchivarTemaMarketing(formData: FormData) {
  await decidirTemaMarketing('desarchivar', formData)
}
export async function borrarTemaMarketing(formData: FormData) {
  await decidirTemaMarketing('borrar', formData)
}

/** Marketing: limpieza en bloque de UNA web (descartar propuestos, archivar descartados, borrar archivados). */
export async function loteMarketing(formData: FormData) {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
  const que = String(formData.get('que') ?? '')
  if (que !== 'descartar-propuestos' && que !== 'archivar-descartados' && que !== 'borrar-archivados') redirect(volverMarketing(formData))
  const destino = String(formData.get('destino') ?? '').trim()
  const r = await decidirLote(destino, que, { store: marketingStoreDb })
  redirect(volverMarketing(formData, r.ok ? { aviso: `${r.n} tema(s) ${que === 'descartar-propuestos' ? 'descartados' : que === 'archivar-descartados' ? 'archivados' : 'borrados'} en ${destino}` } : { error: r.error ?? 'error' }))
}

/** Marketing: redactar ESTE tema aprobado ahora (elige tú cuál, sin esperar al calendario). */
export async function redactarTemaMarketing(formData: FormData) {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
  const id = String(formData.get('id') ?? '')
  const h = await headers()
  const origin = process.env.APP_URL?.trim() || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`
  const r = id ? await redactarTema(id, depsMarketing(origin)) : { ok: false, error: 'falta el tema' }
  if (r.ok && r.sessionId) redirect(volverMarketing(formData, { s: r.sessionId }))
  redirect(volverMarketing(formData, { error: r.error ?? 'error' }))
}

/** Marketing: proponer temas de UNA web (o de todas, si se elige así expresamente) ahora, sin esperar al calendario. */
export async function lanzarMarketing(formData: FormData) {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
  const destino = String(formData.get('destino') ?? '').trim()
  if (!destino) redirect(volverMarketing(formData, { error: 'elige para qué web quieres proponer temas' }))
  const h = await headers()
  const origin = process.env.APP_URL?.trim() || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`
  const r = await cicloMarketing(depsMarketing(origin), { forzar: 'plan', destino: destino === '*' ? undefined : destino })
  const abierta = r.planes[0]
  if (abierta) redirect(volverMarketing(formData, { s: abierta, aviso: `${r.planes.length} plan(es) abierto(s)${destino === '*' ? ' (todas las webs)' : ` para ${destino}`}` }))
  redirect(volverMarketing(formData, { error: 'ya hay un plan en curso o faltan las claves de los modelos' }))
}

// ─── Política (Con-textos 29N) ─────────────────────────────────────────────────

const volverPolitica = (extra: Record<string, string> = {}) => `/panel?${new URLSearchParams({ tab: 'politica', ...extra })}`

async function origenPolitica() {
  const h = await headers()
  return process.env.APP_URL?.trim() || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`
}

async function soloUsuario() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
}

/** Política: abrir AHORA la edición de hoy que elijas (sin esperar al cron). */
export async function abrirEdicionPolitica(formData: FormData) {
  await soloUsuario()
  const id = String(formData.get('edicion') ?? '') as EdicionId
  if (!EDICIONES.some((e) => e.id === id)) redirect(volverPolitica({ error: 'elige una edición' }))
  const r = await cicloPolitica(depsPolitica(await origenPolitica()), { forzarEdicion: id })
  const hecho = r.ediciones.find((e) => e.edicion === id)
  if (hecho?.resultado === 'abierta') redirect(volverPolitica({ aviso: `edición de la ${EDICIONES.find((e) => e.id === id)!.label.toLowerCase()} abierta` }))
  redirect(volverPolitica({ error: hecho?.resultado === 'sin-modelos' ? 'faltan las claves de los modelos' : 'esa edición ya está abierta' }))
}

/** Política: un extra (madrugada o algo que ocurre) con la instrucción de Javier. */
export async function abrirExtraPolitica(formData: FormData) {
  await soloUsuario()
  const encargo = String(formData.get('encargo') ?? '').trim()
  const edicion = formData.get('edicion') === 'madrugada' ? 'madrugada' : 'extra'
  if (encargo.length < 10) redirect(volverPolitica({ error: 'cuenta en una o dos frases qué ha pasado o qué hay que cubrir' }))
  const r = await abrirExtra({ edicion, encargo }, depsPolitica(await origenPolitica()))
  redirect(volverPolitica(r.tipo === 'abierta' ? { s: r.sessionId, aviso: 'extra abierto' } : { error: r.tipo === 'sin-modelos' ? 'faltan las claves de los modelos' : 'ya existe' }))
}

/** Política: una ronda del vigía ahora mismo (sin esperar a la hora en punto ni a POLITICA_VIGIA). */
export async function abrirVigiaPolitica() {
  await soloUsuario()
  const now = new Date()
  const dia = diaMadrid(now)
  // Clave propia para no chocar con la ronda horaria: día + hora + minuto.
  const r = await abrirVigiaManual(dia, now, depsPolitica(await origenPolitica()))
  redirect(volverPolitica(r.tipo === 'abierta' ? { s: r.sessionId, aviso: 'ronda del vigía abierta' } : { error: r.tipo === 'sin-modelos' ? 'faltan las claves de los modelos' : 'ya hay una ronda abierta' }))
}

/** Política: comprobar un bulo (la afirmación tal cual circula). */
export async function abrirBuloPolitica(formData: FormData) {
  await soloUsuario()
  const afirmacion = String(formData.get('afirmacion') ?? '').trim()
  if (afirmacion.length < 10) redirect(volverPolitica({ error: 'escribe la afirmación tal cual circula (mínimo 10 caracteres)' }))
  const r = await abrirBulo(afirmacion, depsPolitica(await origenPolitica()))
  redirect(volverPolitica(r.tipo === 'abierta' ? { s: r.sessionId, aviso: 'comprobación abierta' } : { error: r.tipo === 'sin-modelos' ? 'faltan las claves de los modelos' : 'ya existe' }))
}

export async function reescribirPiezaPolitica(formData: FormData) {
  await soloUsuario()
  const r = await reescribir(String(formData.get('id') ?? ''), String(formData.get('nota') ?? '') || null, depsPolitica(await origenPolitica()))
  redirect(volverPolitica(r.ok && r.sessionId ? { s: r.sessionId, aviso: 'reescritura abierta' } : { error: r.error ?? 'error' }))
}

export async function archivarPiezaPolitica(formData: FormData) {
  await soloUsuario()
  const id = String(formData.get('id') ?? '')
  const p = await politicaStoreDb.pieza(id)
  if (p && ['rechazada', 'vetada', 'fallida', 'publicada'].includes(p.estado)) await politicaStoreDb.actualizar(id, { estado: 'archivada' })
  redirect(volverPolitica())
}

/* ------------------------------------------------------------------ */
/* Mi cartera (tenencias reales de cripto del usuario)                 */
/* ------------------------------------------------------------------ */

const volverCartera = (extra: Record<string, string> = {}) =>
  `/panel?${new URLSearchParams({ tab: 'trading', ...extra }).toString()}`

/** Añade o actualiza una tenencia: símbolo + unidades; el precio de referencia (USD) se captura ahora. */
export async function guardarHolding(formData: FormData) {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
  const owner = session.user.email.toLowerCase()
  const symbol = String(formData.get('symbol') ?? '').trim().toUpperCase()
  if (!(CARTERA_SIMBOLOS as readonly string[]).includes(symbol)) redirect(volverCartera({ error: 'símbolo no válido' }))
  const unidades = Number(String(formData.get('unidades') ?? '').replace(',', '.'))
  if (!Number.isFinite(unidades) || unidades <= 0) redirect(volverCartera({ error: 'unidades no válidas' }))
  const refPriceUsd = await cierreEnVivo(symbol as CarteraSimbolo)
  if (refPriceUsd == null) redirect(volverCartera({ error: 'no pude obtener el precio ahora, reinténtalo' }))
  await db
    .insert(cryptoCartera)
    .values({ owner, symbol, unidades: unidades.toFixed(12), refPriceUsd: refPriceUsd.toFixed(8) })
    .onConflictDoUpdate({
      target: [cryptoCartera.owner, cryptoCartera.symbol],
      set: { unidades: unidades.toFixed(12), refPriceUsd: refPriceUsd.toFixed(8), updatedAt: new Date() },
    })
  // Primer punto del historial hoy (para que el gráfico no empiece vacío). Mejor esfuerzo.
  try {
    const v = await valorarCartera(owner)
    if (v.valorEur != null) await registrarSnapshotCartera(owner, v.valorEur)
  } catch {}
  redirect(volverCartera({ aviso: 'cartera guardada' }))
}

/** Guarda el perfil de inversión (horizonte + tolerancia) para adaptar el consejo de la mesa. */
export async function guardarPerfil(formData: FormData) {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
  const owner = session.user.email.toLowerCase()
  const p = parsePerfil(formData.get('horizonte'), formData.get('tolerancia'))
  await guardarPerfilDb(owner, p)
  redirect(volverCartera({ aviso: 'perfil guardado' }))
}

/** Quita una tenencia de la cartera. */
export async function quitarHolding(formData: FormData) {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
  const owner = session.user.email.toLowerCase()
  const symbol = String(formData.get('symbol') ?? '').trim().toUpperCase()
  if (symbol) await db.delete(cryptoCartera).where(and(eq(cryptoCartera.owner, owner), eq(cryptoCartera.symbol, symbol)))
  redirect(volverCartera({ aviso: 'tenencia quitada' }))
}
