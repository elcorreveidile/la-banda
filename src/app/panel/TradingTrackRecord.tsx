import type { TrackRecord } from '@/lib/trading/trackrecord'

const LABEL: Record<string, string> = { comprar: 'Comprar', vender: 'Vender/salir', mantener: 'Mantener' }
const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(0)} %`)

/** Track record de las recomendaciones (desde cada recomendación hasta hoy). Servidor. */
export function TradingTrackRecord({ track }: { track: TrackRecord }) {
  if (!track.evaluadas) {
    return (
      <section className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <p className="flex items-center gap-1.5 font-bold">
          <span className="h-2 w-2 rounded-full bg-sky-500" />
          Aciertos de la mesa
        </p>
        <p className="text-xs text-stone-500">Aún no hay recomendaciones guardadas suficientes para puntuar. Se guarda una foto al día.</p>
      </section>
    )
  }
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 font-bold">
        <span className="h-2 w-2 rounded-full bg-sky-500" />
        Aciertos de la mesa <span className="font-normal text-stone-500">· {pct(track.pct)} ({track.aciertos}/{track.evaluadas})</span>
      </p>
      <table className="w-full text-xs">
        <thead className="text-left text-stone-500">
          <tr>
            <th className="pr-2">acción</th>
            <th className="pr-2">aciertos</th>
            <th className="pr-2">%</th>
          </tr>
        </thead>
        <tbody>
          {track.porAccion.map((p) => (
            <tr key={p.accion} className="border-t border-stone-100">
              <td className="pr-2">{LABEL[p.accion] ?? p.accion}</td>
              <td className="pr-2 tabular-nums">
                {p.aciertos}/{p.aciertos + p.fallos}
              </td>
              <td className="pr-2 tabular-nums">{pct(p.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[0.7rem] leading-snug text-stone-400">
        Se evalúa cada recomendación guardada contra el precio de hoy (comprar acierta si subió; vender/salir si bajó; mantener si no cayó; «fuera» no se puntúa). Banda ±2 %. Es el histórico real de la mesa simulada, no una promesa.
      </p>
    </section>
  )
}
