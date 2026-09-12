'use server'

import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { auth } from '@/lib/auth'
import { engine } from '@/engine'
import { getDomain } from '@domains/index'
import { runTradingCycle } from '@/lib/trading/cycle'
import { kickTick, selfOrigin } from '@/engine/tick'
import { headers } from 'next/headers'

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
