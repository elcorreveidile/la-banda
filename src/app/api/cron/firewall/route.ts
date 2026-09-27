import { NextResponse } from 'next/server'
import { engine } from '@/engine'
import { engineSecret } from '@/engine/tick'
import { getDomain } from '@domains/index'
import { cicloFirewall } from '@/lib/firewall/cycle'
import { FIREWALL_DOMAIN, cacheTtlMs } from '@/lib/firewall/config'
import { firewallStoreDb, leerSesionDb } from '@/lib/firewall/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Cron de Vercel (vercel.json, cada 5 min). Cierra las revisiones cuya mesa terminó sin que
 * el tick lo recogiera (abandonadas por la bomba, tick perdido), reintenta los webhooks con
 * backoff y, pasado el TTL del caché, borra fragmento y user-agent de las filas y la traza
 * de las sesiones del dominio (llevan esos datos en los traspasos).
 */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${engineSecret()}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const r = await cicloFirewall({ store: firewallStoreDb, sesion: leerSesionDb })
    const purgadas = (await engine.purgeClosed(getDomain(FIREWALL_DOMAIN), cacheTtlMs())).length
    return NextResponse.json({ ok: true, ...r, sesionesPurgadas: purgadas })
  } catch (err) {
    console.error('[la-banda] cron firewall', err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
