import { guardarPerfil } from './actions'
import { PERFIL_DEF, type Perfil } from '@/lib/trading/perfil'

/** Perfil de inversión: horizonte + tolerancia. La mesa adapta el consejo. Servidor. */
export function TradingPerfil({ perfil }: { perfil: Perfil | null }) {
  const p = perfil ?? PERFIL_DEF
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 font-bold">
        <span className="h-2 w-2 rounded-full bg-sky-500" />
        Mi perfil
      </p>
      <form action={guardarPerfil} className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-stone-500">horizonte</span>
          <select name="horizonte" defaultValue={p.horizonte} className="rounded border border-stone-300 px-2 py-1.5 sm:py-1">
            <option value="largo">Largo plazo</option>
            <option value="activo">Activo (corto)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-stone-500">tolerancia al riesgo</span>
          <select name="tolerancia" defaultValue={p.tolerancia} className="rounded border border-stone-300 px-2 py-1.5 sm:py-1">
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-sky-600 px-3 py-2 font-semibold text-white shadow-sm hover:bg-sky-700 sm:py-1.5">
          Guardar
        </button>
      </form>
      <p className="text-[0.7rem] leading-snug text-stone-400">
        La mesa adapta su consejo: largo plazo prioriza mantener; tolerancia baja, más prudencia con «comprar».
      </p>
    </section>
  )
}
