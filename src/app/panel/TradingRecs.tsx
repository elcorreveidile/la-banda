import clsx from 'clsx'
import type { Accion, Recomendacion } from '@/lib/trading/recomendaciones'

const usd = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)} $`)
const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-ES', { hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

const ACCION: Record<Accion, { label: string; cls: string }> = {
  comprar: { label: 'COMPRAR', cls: 'bg-emerald-100 text-emerald-800' },
  vender: { label: 'VENDER / SALIR', cls: 'bg-red-100 text-red-800' },
  mantener: { label: 'MANTENER', cls: 'bg-sky-100 text-sky-800' },
  fuera: { label: 'FUERA / ESPERAR', cls: 'bg-stone-100 text-stone-600' },
}

/** Recomendaciones de la mesa por símbolo (última lectura). Servidor. */
export function TradingRecs({ ciclo, recs }: { ciclo: string | null; recs: Recomendacion[] }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 font-bold">
        <span className="h-2 w-2 rounded-full bg-sky-500" />
        Recomendaciones
      </p>
      {recs.length === 0 ? (
        <p className="text-xs text-stone-500">Aún no hay recomendaciones: lanza un ciclo y espera a que la mesa cierre.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {recs.map((r) => (
            <li key={r.symbol} className="rounded-lg border border-stone-100 p-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <b className="font-mono">{r.symbol}</b>
                <span className={clsx('rounded px-1.5 py-0.5 text-xs font-bold', ACCION[r.accion].cls)}>{ACCION[r.accion].label}</span>
                <span className="text-xs text-stone-500">confianza {r.confianza}</span>
              </div>
              {(r.entrada != null || r.stop != null || r.objetivo != null || r.horizonte) && (
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-stone-600">
                  {r.entrada != null && <span>entrada {usd(r.entrada)}</span>}
                  {r.stop != null && <span>stop {usd(r.stop)}</span>}
                  {r.objetivo != null && <span>objetivo {usd(r.objetivo)}</span>}
                  {r.horizonte && <span>horizonte {r.horizonte}</span>}
                </div>
              )}
              {r.motivo && <p className="mt-1 text-xs text-stone-700">{r.motivo}</p>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[0.7rem] leading-snug text-stone-400">
        {ciclo ? `Última lectura: ${hora(ciclo)} · ` : ''}Opinión de una mesa de IA simulada (solo-largo); no es asesoramiento financiero. Las criptomonedas son de alto riesgo: «vender/salir» se refiere a reducir o cerrar lo que ya tengas.
      </p>
    </section>
  )
}
