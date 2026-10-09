import { NextResponse } from 'next/server'
import { engineSecret } from '@/engine/tick'
import { ultimasRecomendaciones } from '@/lib/trading/metrics'
import { snapshot } from '@/lib/trading/portfolio'
import { componerResumenTrading } from '@/lib/trading/recomendaciones'
import { valorarCartera, registrarSnapshotCartera } from '@/lib/trading/cartera'
import { tendenciasDe } from '@/lib/trading/tendencia'
import { SYMBOLS } from '@/lib/trading/sim'
import { sendBrevoEmail } from '@/lib/brevo'
import { revisorEmail } from '@/lib/marketing/config'

/** Dueño de la cartera personal (el primer correo de ALLOWED_EMAILS; es quien entra al panel). */
function carteraOwner(): string {
  return (process.env.ALLOWED_EMAILS ?? '').split(',')[0]?.trim().toLowerCase() || ''
}

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
    const owner = carteraOwner()
    const [{ ciclo, recomendaciones }, cartera, carteraPersonal, tendencias] = await Promise.all([
      ultimasRecomendaciones(),
      snapshot(),
      owner ? valorarCartera(owner) : Promise.resolve(null),
      tendenciasDe(SYMBOLS),
    ])
    // Foto diaria del valor de la cartera (para el gráfico de evolución). Mejor esfuerzo.
    if (owner && carteraPersonal?.valorEur != null) await registrarSnapshotCartera(owner, carteraPersonal.valorEur).catch(() => {})
    const correo = componerResumenTrading({
      ciclo,
      recomendaciones,
      cartera: { equityUsd: cartera.equityUsd, cashUsd: cartera.cashUsd, initialUsd: cartera.initialUsd },
      carteraPersonal,
      tendencias,
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
