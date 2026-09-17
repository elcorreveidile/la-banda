import { NIVELES } from '@domains/corpus-ele/config'
import { hasClinica } from '@/lib/clinica'
import { resumeStalledSessions, startCorpusMuestra } from './actions'
import { CORPUS_DOMAIN } from '@/lib/corpus/cycle'

/** Tarjeta del dominio corpus-ele: encargar una muestra de habla situada en Granada. Servidor. */
export function CorpusCard() {
  const conectada = hasClinica()
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 font-bold"><span className="h-2 w-2 rounded-full bg-emerald-500" />Corpus ELE · un semestre en Granada</p>
      <form action={startCorpusMuestra} className="grid gap-2 sm:grid-cols-3">
        <input name="situacion" required minLength={2} maxLength={120} placeholder="Situación (bar, farmacia, piso…)" className="rounded border border-stone-300 px-2 py-1.5 sm:py-1" />
        <select name="nivel" required className="rounded border border-stone-300 px-2 py-1.5 sm:py-1" defaultValue="A2">
          {NIVELES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select name="tipo" required className="rounded border border-stone-300 px-2 py-1.5 sm:py-1" defaultValue="muestra_habla">
          <option value="muestra_habla">muestra de habla</option>
          <option value="texto_situado">texto situado</option>
          <option value="transcripcion_oral">transcripción oral</option>
          <option value="texto_escrito">texto escrito</option>
        </select>
        <input name="notas" maxLength={1000} placeholder="Notas para la cadena (opcional)" className="rounded border border-stone-300 px-2 py-1.5 sm:py-1 sm:col-span-2" />
        <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-2 font-semibold text-white shadow-sm hover:bg-emerald-700 sm:py-1.5">
          Producir muestra
        </button>
      </form>
      <form action={resumeStalledSessions} className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2">
        <input type="hidden" name="domain" value={CORPUS_DOMAIN} />
        <span className="text-xs text-stone-500">¿Una sesión parada en «esperando»? Lanza un ciclo de la bomba de ticks ahora mismo (el cron lo hace cada minuto): relanza las pendientes y abandona las de más de 6 h.</span>
        <button type="submit" className="rounded border border-stone-300 px-3 py-2 sm:py-1.5 hover:bg-stone-100">
          Reanudar colgadas
        </button>
      </form>
      <p className="text-xs text-stone-500">
        PCIC antes que nada, etiquetario cerrado, procedencia declarada. Helsinki registra la pieza en la Clínica
        {conectada ? '.' : ' (CLINICA_URL / CLINICA_CORPUS_KEY sin configurar: la pieza no se registrará).'} Las producciones de alumnos llegan solas por el cron diario.
      </p>
    </section>
  )
}
