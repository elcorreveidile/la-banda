import { NextResponse } from 'next/server'
import { db } from '@/db'
import { tradingAlertaEstado } from '@/db/trading'
import { engineSecret } from '@/engine/tick'
import { SYMBOLS } from '@/lib/trading/sim'
import { ultimasRecomendaciones } from '@/lib/trading/metrics'
import { cierreEnVivo, hoyUTC } from '@/lib/trading/cartera'
import { tendenciasDe } from '@/lib/trading/tendencia'
import { evaluarAlerta, leerEstado, ESTADO_VACIO, type EstadoAlerta } from '@/lib/trading/alertas'
import { sendBrevoEmail } from '@/lib/brevo'
import { revisorEmail } from '@/lib/marketing/config'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function destinatario(): string {
  return process.env.TRADING_ALERT_EMAIL?.trim().toLowerCase() || revisorEmail()
}

/**
 * Cron de alertas (vercel.json). Avisa SOLO cuando algo cambia: la recomendación de una moneda, un
 * nivel (stop/objetivo) tocado o un movimiento fuerte del día. Guarda el estado por símbolo para no
 * repetir. Mejor esfuerzo; nunca lanza al cliente del cron.
 */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${engineSecret()}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const [{ recomendaciones }, tends, filas] = await Promise.all([ultimasRecomendaciones(), tendenciasDe(SYMBOLS), db.select().from(tradingAlertaEstado)])
    const estadoPrevio = new Map<string, EstadoAlerta>(filas.map((f) => [f.symbol, leerEstado(f.estado)]))
    const day = hoyUTC()
    const avisos: string[] = []

    for (const symbol of SYMBOLS) {
      const reco = recomendaciones.find((r) => r.symbol === symbol)
      const precio = await cierreEnVivo(symbol)
      const t = tends[symbol]
      const cambio1 = precio != null && t?.precio ? precio / t.precio - 1 : (t?.cambio1 ?? null)
      const prev = estadoPrevio.get(symbol) ?? ESTADO_VACIO
      const { avisos: nuevos, estado } = evaluarAlerta(prev, {
        symbol,
        accion: reco?.accion ?? null,
        precio,
        stop: reco?.stop ?? null,
        objetivo: reco?.objetivo ?? null,
        cambio1,
        day,
      })
      avisos.push(...nuevos)
      const estadoJson = estado as unknown as Record<string, unknown>
      await db
        .insert(tradingAlertaEstado)
        .values({ symbol, estado: estadoJson })
        .onConflictDoUpdate({ target: tradingAlertaEstado.symbol, set: { estado: estadoJson, updatedAt: new Date() } })
    }

    if (!avisos.length) return NextResponse.json({ ok: true, avisos: 0 })

    const texto = ['La mesa ha detectado cambios:', '', ...avisos.map((a) => `• ${a}`), '', 'Opinión de una mesa de IA simulada, no asesoramiento financiero.'].join('\n')
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1c1917"><p>La mesa ha detectado cambios:</p><ul>${avisos
      .map((a) => `<li>${a.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</li>`)
      .join('')}</ul><p style="color:#999;font-size:12px">Opinión de una mesa de IA simulada, no asesoramiento financiero.</p></div>`
    await sendBrevoEmail({ to: destinatario(), subject: `La Banda · alertas (${day})`, html, text: texto })
    return NextResponse.json({ ok: true, avisos: avisos.length })
  } catch (err) {
    console.error('[la-banda] cron trading-alertas', err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
