import clsx from 'clsx'
import type { TradingMetrics } from '@/lib/trading/metrics'
import { TradingCharts } from './TradingCharts'

const usd = (v: number | null | undefined, digits = 2) => (v == null ? '—' : `${v.toFixed(digits)} $`)
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-ES', { hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')

/** Métricas del dominio trading (brief §5). Servidor. */
export function TradingMetricsCard({ m }: { m: TradingMetrics }) {
  const p = m.portfolio
  const delta = p.equityUsd - p.initialUsd
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 font-bold"><span className="h-2 w-2 rounded-full bg-sky-500" />Trading simulado</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="patrimonio" value={usd(p.equityUsd)} tone={delta >= 0 ? 'text-emerald-700' : 'text-red-700'} />
        <Stat label="caja" value={usd(p.cashUsd)} />
        <Stat label="resultado" value={`${delta >= 0 ? '+' : ''}${usd(delta)}`} tone={delta >= 0 ? 'text-emerald-700' : 'text-red-700'} />
        <Stat label="operaciones" value={String(m.executed)} />
        <Stat label="vetos Palermo" value={String(m.vetoes)} />
        <Stat label="devoluciones Lisboa" value={String(m.returns)} />
      </dl>
      {p.positions.length > 0 && (
        <ul className="text-xs">
          {p.positions.map((pos) => (
            <li key={pos.id} className="flex flex-wrap gap-x-3">
              <b>{pos.symbol}</b>
              <span>entrada {usd(pos.entryPrice)}</span>
              <span>último {usd(pos.lastClose)}</span>
              <span>stop {usd(pos.stopPrice)}</span>
              <span>objetivo {usd(pos.targetPrice)}</span>
              <span className={clsx((pos.unrealizedUsd ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700')}>latente {usd(pos.unrealizedUsd)}</span>
              <span className="text-stone-500">{pos.hoursOpen} h</span>
            </li>
          ))}
        </ul>
      )}
      <TradingCharts trades={m.trades} initialUsd={p.initialUsd} />
      {m.trades.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-stone-500">
              <tr>
                <th className="pr-2">abierta</th>
                <th className="pr-2">símbolo</th>
                <th className="pr-2">importe</th>
                <th className="pr-2">entrada</th>
                <th className="pr-2">salida</th>
                <th className="pr-2">motivo</th>
                <th className="pr-2">resultado</th>
              </tr>
            </thead>
            <tbody>
              {m.trades.map((t) => (
                <tr key={t.id} className={clsx('border-t border-stone-100', t.status === 'rejected' && 'text-stone-400')}>
                  <td className="pr-2">{hora(t.openedAt)}</td>
                  <td className="pr-2">{t.symbol}</td>
                  <td className="pr-2">{usd(t.sizeUsd)}</td>
                  <td className="pr-2">{t.status === 'rejected' ? 'rechazada' : usd(t.entryPrice)}</td>
                  <td className="pr-2">{usd(t.exitPrice)}</td>
                  <td className="pr-2">{t.exitReason ?? (t.status === 'open' ? 'abierta' : t.status === 'rejected' ? t.note?.slice(0, 60) : '—')}</td>
                  <td className={clsx('pr-2', t.pnlUsd != null && (t.pnlUsd >= 0 ? 'text-emerald-700' : 'text-red-700'))}>{t.pnlUsd == null ? '—' : `${t.pnlUsd >= 0 ? '+' : ''}${usd(t.pnlUsd, 3)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className={clsx('font-bold', tone)}>{value}</dd>
    </div>
  )
}
