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
import { cicloMarketing, decidirTema } from '@/lib/marketing/ciclo'
import { depsMarketing } from '@/lib/marketing/deps'
import { marketingStoreDb } from '@/lib/marketing/store'

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

/** Marketing: aprobar, descartar o pedir reescritura de un tema (Javier, en su revisión del domingo). */
export async function decidirTemaMarketing(formData: FormData) {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
  const id = String(formData.get('id') ?? '')
  const decision = String(formData.get('decision') ?? '')
  const nota = String(formData.get('nota') ?? '')
  if (!id || !['aprobar', 'descartar', 'reescribir'].includes(decision)) redirect('/panel?tab=marketing')
  const r = await decidirTema(id, decision as 'aprobar' | 'descartar' | 'reescribir', nota, { store: marketingStoreDb })
  redirect(`/panel?tab=marketing${r.ok ? '' : `&error=${encodeURIComponent(r.error ?? 'error')}`}`)
}

/** Marketing: proponer temas o redactar el siguiente tema aprobado ahora, sin esperar al calendario. */
export async function lanzarMarketing(formData: FormData) {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
  const que = String(formData.get('que') ?? '')
  if (que !== 'plan' && que !== 'redaccion') redirect('/panel?tab=marketing')
  const h = await headers()
  const origin = process.env.APP_URL?.trim() || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`
  const r = await cicloMarketing(depsMarketing(origin), { forzar: que })
  const abierta = r.planes[0] ?? r.redacciones[0]
  redirect(abierta ? `/panel?tab=marketing&s=${abierta}` : `/panel?tab=marketing&error=${encodeURIComponent(que === 'plan' ? 'ya hay un plan en curso o faltan las claves de los modelos' : 'no hay temas aprobados, ya hay una redacción en curso, la semana siguiente está completa o faltan las claves')}`)
}
