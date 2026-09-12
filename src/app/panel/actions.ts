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

/** Abre una sesión del dominio de juguete y deja al orquestador corriendo tras responder. */
export async function startToySession(formData: FormData) {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  const tema = String(formData.get('tema') ?? '').trim().slice(0, 300)
  if (!tema) redirect('/panel')

  const domain = getDomain('toy')
  const opened = await engine.openSession(domain, { kind: 'propuesta', payload: { tema }, createdBy: session.user.email })

  after(async () => {
    try {
      await engine.runSession(domain, opened.session.id)
    } catch (err) {
      console.error('[la-banda] runSession', opened.session.id, err)
    }
  })

  redirect(`/panel?s=${opened.session.id}`)
}

/** Lanza un ciclo de trading a mano (mismo camino que el cron) y arranca la cadena de ticks. */
export async function startTradingCycle() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  const h = await headers()
  const origin = process.env.APP_URL?.trim() || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`
  const result = await runTradingCycle(session.user.email)

  after(async () => {
    try {
      await kickTick(selfOrigin(origin), 'trading', result.sessionId)
    } catch (err) {
      console.error('[la-banda] kickTick', result.sessionId, err)
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
