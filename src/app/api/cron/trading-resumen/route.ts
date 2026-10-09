import { NextResponse } from 'next/server'
import { engineSecret } from '@/engine/tick'
import { ultimasRecomendaciones } from '@/lib/trading/metrics'
import { snapshot } from '@/lib/trading/portfolio'
import { componerResumenTrading } from '@/lib/trading/recomendaciones'
import { sendBrevoEmail } from '@/lib/brevo'
import { revisorEmail } from '@/lib/marketing/config'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** Destinatario del resumen de trading: TRADING_ALERT_EMAIL, o el revisor de marketing como respaldo. */
function destinatario(): string {
  return process.env.TRADING_ALERT_EMAIL?.trim().toLowerCase() || revisorEmail()
}

/**
 * Cron diario (vercel.json): envía por correo la última lectura de la mesa
 * (recomendaciones por símbolo + cartera). Mejor esfuerzo; si no hay ciclo cerrado
 * reciente, `componerResumenTrading` devuelve null y no se envía nada.
 */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${engineSecret()}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const [{ ciclo, recomendaciones }, cartera] = await Promise.all([ultimasRecomendaciones(), snapshot()])
    const correo = componerResumenTrading({
      ciclo,
      recomendaciones,
      cartera: { equityUsd: cartera.equityUsd, cashUsd: cartera.cashUsd, initialUsd: cartera.initialUsd },
    })
    if (!correo) return NextResponse.json({ ok: true, enviado: false, motivo: 'sin recomendaciones' })
    const to = destinatario()
    await sendBrevoEmail({ to, subject: correo.asunto, html: correo.html, text: correo.texto })
    return NextResponse.json({ ok: true, enviado: true, to, simbolos: recomendaciones.length })
  } catch (err) {
    console.error('[la-banda] cron trading-resumen', err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
