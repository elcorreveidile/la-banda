import Link from 'next/link'
import clsx from 'clsx'
import type { Objection } from '@/db/olvidos'
import type { OlvidosMetrics } from '@/lib/olvidos/metrics'
import { SECCIONES } from '@domains/olvidos/secciones'
import { Codename } from '@/components/Codename'
import { submitManuscript } from './actions'

const DECISION_STYLE: Record<string, string> = { publicable: 'text-emerald-700', con_cambios: 'text-amber-700', rechazado: 'text-red-700' }

/** Tarjeta del dominio Olvidos: envío de manuscritos, métricas y manuscritos recientes. Servidor. */
export function OlvidosCard({ m }: { m: OlvidosMetrics }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 font-bold"><span className="h-2 w-2 rounded-full bg-amber-500" />Redacción de Olvidos</p>

      <form action={submitManuscript} className="grid gap-2 sm:grid-cols-2">
        <input name="title" required maxLength={200} placeholder="Título" className="rounded border border-stone-300 px-2 py-1.5 sm:py-1" />
        <input name="byline" maxLength={120} placeholder="Firma (opcional)" className="rounded border border-stone-300 px-2 py-1.5 sm:py-1" />
        <select name="section" required className="rounded border border-stone-300 px-2 py-1.5 sm:py-1" defaultValue="">
          <option value="" disabled>
            Sección de destino
          </option>
          {SECCIONES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
        <input name="file" type="file" accept=".md,.txt,.docx,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="text-xs" />
        <textarea name="text" rows={4} placeholder="…o pega aquí el texto (Markdown o texto plano)" className="rounded border border-stone-300 px-2 py-1.5 sm:py-1 sm:col-span-2" />
        <div className="flex items-center justify-between gap-2 sm:col-span-2">
          <span className="text-xs text-stone-500">Los agentes señalan, no corrigen: el resultado es un informe con objeciones numeradas y veredicto.</span>
          <button type="submit" className="rounded-lg bg-amber-600 px-3 py-2 font-semibold text-white shadow-sm hover:bg-amber-700 sm:py-1.5">
            Enviar a redacción
          </button>
        </div>
      </form>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-6 text-xs">
        <Stat label="sesiones" value={String(m.sessions)} />
        <Stat label="publicables" value={String(m.decisions.publicable)} tone="text-emerald-700" />
        <Stat label="con cambios" value={String(m.decisions.con_cambios)} tone="text-amber-700" />
        <Stat label="rechazados" value={String(m.decisions.rechazado)} tone="text-red-700" />
        <Stat label="devoluciones Lisboa" value={String(m.returns)} />
        <Stat label="objeciones" value={Object.entries(m.objectionsByAgent).map(([a, n]) => `${a} ${n}`).join(' · ') || '0'} />
      </dl>

      {m.manuscripts.length > 0 && (
        <ul className="text-xs">
          {m.manuscripts.map(({ manuscript, version, objections }) => (
            <li key={manuscript.id} className="flex flex-wrap items-center gap-x-3 border-t border-stone-100 py-1">
              <b>{manuscript.title}</b>
              {manuscript.byline && <span className="text-stone-500">{manuscript.byline}</span>}
              <span>{SECCIONES.find((s) => s.key === manuscript.section)?.name ?? manuscript.section}</span>
              <span>
                v{version.number} · {version.wordCount} palabras
              </span>
              <span className={clsx(DECISION_STYLE[version.decision ?? ''] ?? 'text-stone-500')}>{version.decision ?? 'en curso'}</span>
              <span>{objections} objeciones</span>
              {version.sessionId && (
                <Link href={`/panel?s=${version.sessionId}`} className="underline">
                  sesión
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Objeciones numeradas de la sesión seleccionada (informe de redacción). */
export function ObjectionsList({ items }: { items: Objection[] }) {
  if (!items.length) return null
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="font-bold">Objeciones ({items.length})</p>
      <ol className="mt-1 flex flex-col gap-1 text-xs">
        {items.map((o) => (
          <li key={o.id} className="grid grid-cols-[2rem_5rem_6rem_1fr] gap-2">
            <span className="text-stone-500">{o.number}.</span>
            <span className={clsx('font-bold', o.severity === 'mayor' ? 'text-red-700' : 'text-amber-700')}>{o.severity}</span>
            <span>
              <Codename name={o.agent} />
            </span>
            <span>
              {o.location && <span className="text-stone-500">{o.location} · </span>}
              {o.text}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-stone-500">{label}</dt>
      <dd className={clsx('font-bold', tone)}>{value}</dd>
    </div>
  )
}
