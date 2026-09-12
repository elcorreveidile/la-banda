'use client'

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TradeRow } from '@/lib/trading/metrics'

const POS = '#2a78d6'
const NEG = '#e34948'
const LINE = '#2a78d6'

const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} $`
const fecha = (iso: string) => new Date(iso).toLocaleString('es-ES', { hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Resultado por operación (barras, signo por color) y patrimonio realizado acumulado (línea). Recharts. */
export function TradingCharts({ trades, initialUsd }: { trades: TradeRow[]; initialUsd: number }) {
  const closed = trades
    .filter((t) => t.status === 'closed' && t.pnlUsd != null && t.closedAt)
    .sort((a, b) => a.closedAt!.localeCompare(b.closedAt!))
  if (closed.length === 0) return null

  const bars = closed.map((t, i) => ({ n: i + 1, label: `${t.symbol} ${fecha(t.closedAt!)}`, pnl: t.pnlUsd! }))
  let acc = initialUsd
  const curve = [{ n: 0, label: 'inicio', equity: initialUsd }, ...closed.map((t, i) => ({ n: i + 1, label: fecha(t.closedAt!), equity: (acc += t.pnlUsd!) }))]

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <figure className="rounded border border-stone-200 p-2">
        <figcaption className="mb-1 text-xs text-stone-600">Resultado por operación (USD)</figcaption>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={bars} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#e7e5e4" />
            <XAxis dataKey="n" tick={{ fontSize: 10 }} stroke="#a8a29e" />
            <YAxis tick={{ fontSize: 10 }} stroke="#a8a29e" width={40} />
            <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={(_l, p) => (p?.[0]?.payload as { label: string } | undefined)?.label ?? ''} contentStyle={{ fontSize: 11 }} />
            <Bar dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {bars.map((b) => (
                <Cell key={b.n} fill={b.pnl >= 0 ? POS : NEG} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </figure>
      <figure className="rounded border border-stone-200 p-2">
        <figcaption className="mb-1 text-xs text-stone-600">Patrimonio realizado (USD)</figcaption>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={curve} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#e7e5e4" />
            <XAxis dataKey="n" tick={{ fontSize: 10 }} stroke="#a8a29e" />
            <YAxis tick={{ fontSize: 10 }} stroke="#a8a29e" width={40} domain={['auto', 'auto']} />
            <Tooltip formatter={(v: number) => `${v.toFixed(2)} $`} labelFormatter={(_l, p) => (p?.[0]?.payload as { label: string } | undefined)?.label ?? ''} contentStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="equity" stroke={LINE} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </figure>
    </div>
  )
}
