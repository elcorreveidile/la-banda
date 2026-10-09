import clsx from 'clsx'
import { guardarHolding, quitarHolding } from './actions'
import { baseSimbolo, CARTERA_SIMBOLOS, type CarteraValorada } from '@/lib/trading/cartera'
import type { Accion, Recomendacion } from '@/lib/trading/recomendaciones'

const eur = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)} €`)
const usd = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)} $`)
const pct = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)} %`)

const ACCION: Record<Accion, { label: string; cls: string }> = {
  comprar: { label: 'COMPRAR', cls: 'bg-emerald-100 text-emerald-800' },
  vender: { label: 'VENDER / SALIR', cls: 'bg-red-100 text-red-800' },
  mantener: { label: 'MANTENER', cls: 'bg-sky-100 text-sky-800' },
  fuera: { label: 'FUERA / ESPERAR', cls: 'bg-stone-100 text-stone-600' },
}

/** Tenencias reales del usuario, valoradas en € (variación desde que se registraron). Servidor. */
export function MiCartera({ cartera, recs }: { cartera: CarteraValorada; recs: Recomendacion[] }) {
  const accionDe = new Map<string, Accion>(recs.map((r) => [r.symbol, r.accion]))
  const hay = cartera.holdings.length > 0
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 font-bold">
        <span className="h-2 w-2 rounded-full bg-sky-500" />
        Mi cartera
      </p>

      {hay ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-stone-500">
              <tr>
                <th className="pr-2">moneda</th>
                <th className="pr-2">unidades</th>
                <th className="pr-2">precio (USD)</th>
                <th className="pr-2">valor (€)</th>
                <th className="pr-2">variación</th>
                <th className="pr-2">mesa</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cartera.holdings.map((h) => {
                const accion = accionDe.get(h.symbol)
                return (
                  <tr key={h.symbol} className="border-t border-stone-100">
                    <td className="pr-2 font-mono font-bold">{baseSimbolo(h.symbol)}</td>
                    <td className="pr-2 tabular-nums">{h.unidades}</td>
                    <td className="pr-2 tabular-nums">{usd(h.precioActualUsd)}</td>
                    <td className="pr-2 tabular-nums">{eur(h.valorEur)}</td>
                    <td className={clsx('pr-2 tabular-nums', h.pct != null && (h.pct >= 0 ? 'text-emerald-700' : 'text-red-700'))}>{pct(h.pct)}</td>
                    <td className="pr-2">
                      {accion ? (
                        <span className={clsx('rounded px-1.5 py-0.5 font-bold', ACCION[accion].cls)}>{ACCION[accion].label}</span>
                      ) : (
                        <span className="text-stone-400">fuera de cobertura</span>
                      )}
                    </td>
                    <td>
                      <form action={quitarHolding}>
                        <input type="hidden" name="symbol" value={h.symbol} />
                        <button type="submit" className="text-stone-400 hover:text-red-700" aria-label={`Quitar ${baseSimbolo(h.symbol)}`}>
                          ✕
                        </button>
                      </form>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-200 font-bold">
                <td className="pr-2" colSpan={3}>
                  total
                </td>
                <td className="pr-2 tabular-nums">{eur(cartera.valorEur)}</td>
                <td className={clsx('pr-2 tabular-nums', cartera.pct != null && (cartera.pct >= 0 ? 'text-emerald-700' : 'text-red-700'))}>{pct(cartera.pct)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-xs text-stone-500">Aún no has añadido tenencias. Añádelas abajo para ver su valor y la lectura de la mesa.</p>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-stone-500">Añadir o actualizar una tenencia</summary>
        <form action={guardarHolding} className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-stone-500">moneda</span>
            <select name="symbol" required defaultValue="" className="rounded border border-stone-300 px-2 py-1.5 sm:py-1">
              <option value="" disabled>
                elige…
              </option>
              {CARTERA_SIMBOLOS.map((s) => (
                <option key={s} value={s}>
                  {baseSimbolo(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-stone-500">unidades</span>
            <input name="unidades" inputMode="decimal" required placeholder="0,0032" className="w-28 rounded border border-stone-300 px-2 py-1.5 sm:py-1" />
          </label>
          <button type="submit" className="rounded-lg bg-sky-600 px-3 py-2 font-semibold text-white shadow-sm hover:bg-sky-700 sm:py-1.5">
            Guardar
          </button>
        </form>
        <p className="mt-1 text-stone-400">El precio de referencia (para la variación) se toma del mercado al guardar. Vuelve a guardar la misma moneda para actualizar unidades.</p>
      </details>

      <p className="text-[0.7rem] leading-snug text-stone-400">
        Valor en € estimado: precio en USD convertido con el cambio €/USD implícito de BTC (sin fuente de divisa aparte). «Variación» desde que registraste la tenencia, no desde tu compra. La «mesa» solo cubre BTC/ETH/DASH; es opinión de una mesa de IA simulada, no asesoramiento financiero.
      </p>
    </section>
  )
}
