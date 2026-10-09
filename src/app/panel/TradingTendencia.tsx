import clsx from 'clsx'
import type { Direccion, Tendencia } from '@/lib/trading/tendencia'

const usd = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)} $`)
const pct = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)} %`)
const base = (symbol: string) => symbol.split('-')[0]

const DIR: Record<Direccion, { label: string; cls: string }> = {
  alcista: { label: 'ALCISTA', cls: 'bg-emerald-100 text-emerald-800' },
  lateral: { label: 'LATERAL', cls: 'bg-stone-100 text-stone-600' },
  bajista: { label: 'BAJISTA', cls: 'bg-red-100 text-red-800' },
}

function Cambio({ v }: { v: number | null }) {
  return <span className={clsx('tabular-nums', v != null && (v >= 0 ? 'text-emerald-700' : 'text-red-700'))}>{pct(v)}</span>
}

/** Estudio de tendencia (marco diario) por símbolo de la mesa. Servidor. */
export function TradingTendencia({ tendencias }: { tendencias: Record<string, Tendencia | null> }) {
  const filas = Object.entries(tendencias)
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 font-bold">
        <span className="h-2 w-2 rounded-full bg-sky-500" />
        Tendencia (marco diario)
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-stone-500">
            <tr>
              <th className="pr-2">moneda</th>
              <th className="pr-2">dirección</th>
              <th className="pr-2">7 d</th>
              <th className="pr-2">30 d</th>
              <th className="pr-2">90 d</th>
              <th className="pr-2">precio</th>
              <th className="pr-2">medias 20/50/200</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(([symbol, t]) => (
              <tr key={symbol} className="border-t border-stone-100">
                <td className="pr-2 font-mono font-bold">{base(symbol)}</td>
                {t ? (
                  <>
                    <td className="pr-2">
                      <span className={clsx('rounded px-1.5 py-0.5 font-bold', DIR[t.direccion].cls)}>{DIR[t.direccion].label}</span>
                    </td>
                    <td className="pr-2">
                      <Cambio v={t.cambio7} />
                    </td>
                    <td className="pr-2">
                      <Cambio v={t.cambio30} />
                    </td>
                    <td className="pr-2">
                      <Cambio v={t.cambio90} />
                    </td>
                    <td className="pr-2 tabular-nums">{usd(t.precio)}</td>
                    <td className="pr-2 tabular-nums text-stone-500">
                      {usd(t.sma20)} / {usd(t.sma50)} / {usd(t.sma200)}
                    </td>
                  </>
                ) : (
                  <td className="pr-2 text-stone-400" colSpan={6}>
                    —
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[0.7rem] leading-snug text-stone-400">
        Variación de cierre a 7/30/90 días y medias móviles simples (velas diarias). La mesa usa esta tendencia como contexto al recomendar. Precios en USD; opinión de una mesa de IA simulada, no asesoramiento financiero.
      </p>
    </section>
  )
}
