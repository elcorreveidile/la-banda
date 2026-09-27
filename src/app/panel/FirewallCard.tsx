import clsx from 'clsx'
import type { FirewallMetrics } from '@/lib/firewall/metrics'

const VEREDICTO_STYLE: Record<string, string> = { malicious: 'text-red-700', benign: 'text-emerald-700' }
const ESTADO_STYLE: Record<string, string> = { queued: 'text-stone-500', running: 'text-sky-700', done: 'text-stone-700', failed: 'text-red-900' }

/**
 * Tarjeta del dominio Firewall: revisiones de cuarentenas de WordNext (últimos 7 días).
 * No muestra fragmento ni user-agent: son datos de persona y se borran pasado el TTL.
 */
export function FirewallCard({ m }: { m: FirewallMetrics }) {
  const s = m.ultimos7d
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 font-bold"><span className="h-2 w-2 rounded-full bg-rose-500" />Firewall agéntico (carril profundo)</p>
      <span className="text-xs text-stone-500">Cuarentenas que manda wp-next-starter; la banda juzga después si el bloqueo acertó. Solo informa.</span>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="revisiones 7 d" value={s.total} />
        <Stat label="mesas" value={s.mesas} />
        <Stat label="de caché" value={s.cache} />
        <Stat label="maliciosas" value={s.maliciosas} tone="text-red-700" />
        <Stat label="benignas" value={s.benignas} tone="text-emerald-700" />
        <Stat label="fallidas" value={s.fallidas} tone="text-red-900" />
        <Stat label="avisos pendientes" value={s.avisosPendientes} tone="text-amber-700" />
      </dl>
      {m.recientes.length > 0 && (
        <ul className="text-xs">
          {m.recientes.map((r) => (
            <li key={r.id} className="border-t border-stone-100 py-1">
              <div className="flex flex-wrap items-center gap-x-3">
                <span className="font-mono">{r.host}</span>
                <span>{r.reason}</span>
                <span className={clsx(ESTADO_STYLE[r.status])}>{r.status}</span>
                {r.verdict && <b className={clsx(VEREDICTO_STYLE[r.verdict])}>{r.verdict}{r.confidence !== null ? ` · ${r.confidence.toFixed(2)}` : ''}</b>}
                {r.cached && <span className="text-stone-400">caché</span>}
                <span className="text-stone-400">{r.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</span>
              </div>
              {r.rationale && <p className="text-stone-600">{r.rationale}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <dt className="text-stone-500">{label}</dt>
      <dd className={clsx('font-mono font-bold', tone)}>{value}</dd>
    </div>
  )
}
