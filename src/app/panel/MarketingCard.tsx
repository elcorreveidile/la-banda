import clsx from 'clsx'
import type { MarketingMetrics } from '@/lib/marketing/metrics'
import type { EstadoTema } from '@/db/marketing'
import { aprobarTemaMarketing, descartarTemaMarketing, lanzarMarketing, reescribirTemaMarketing } from './actions'
import { BotonTema } from './BotonTema'

const ESTADO_STYLE: Record<EstadoTema, string> = {
  propuesto: 'bg-amber-50 text-amber-900',
  aprobado: 'bg-sky-50 text-sky-800',
  redactando: 'bg-sky-100 text-sky-900',
  en_revision: 'bg-violet-50 text-violet-800',
  publicado: 'bg-emerald-50 text-emerald-800',
  descartado: 'bg-stone-100 text-stone-500',
  rechazado: 'bg-red-50 text-red-800',
  vetado: 'bg-red-50 text-red-800',
  fallido: 'bg-red-100 text-red-900',
}

const fecha = (d: Date | null) => (d ? d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')

type TemaVista = MarketingMetrics['temas'][number]

/**
 * Pestaña Marketing: temas que propone la banda (Javier los aprueba o descarta, idealmente en su
 * revisión del domingo), artículos en marcha con sus enlaces de revisión en WordNext y los que
 * necesitan decisión (rechazados, vetados, fallidos).
 */
export function MarketingCard({ m, error }: { m: MarketingMetrics; error?: string }) {
  // Los aprobados siguen en su sitio con el botón ya en «✓ Aprobado» hasta que empieza su redacción.
  const propuestos = m.temas.filter((t) => t.estado === 'propuesto' || t.estado === 'aprobado')
  const nPropuestos = propuestos.filter((t) => t.estado === 'propuesto').length
  const nAprobados = propuestos.length - nPropuestos
  const enMarcha = m.temas.filter((t) => ['redactando', 'en_revision', 'publicado'].includes(t.estado))
  const decidir = m.temas.filter((t) => ['rechazado', 'vetado', 'fallido'].includes(t.estado))
  const faltas = [!m.configuracion.modelos && 'claves de los modelos (ANTHROPIC_API_KEY)', !m.configuracion.publicacion && 'publicación en WordNext (WORDNEXT_URL y WORDNEXT_CALLBACK_SECRET)'].filter(Boolean)

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-1.5 font-bold"><span className="h-2 w-2 rounded-full bg-fuchsia-500" />Marketing · {m.destinos.map((d) => `${d.destino} (${d.porSemana}/sem.)`).join(' · ')}</p>
        <span className="text-xs text-stone-500">
          Cada artículo en español e inglés. Jueves: la banda propone temas. Jueves a sábado: redacta los aprobados para la semana siguiente. Domingo 08:00: te llega el resumen para revisar. Búsqueda web: {m.configuracion.busqueda}.
        </span>
        {faltas.length > 0 && <span className="text-xs font-semibold text-amber-700">Falta configurar: {faltas.join(' · ')}.</span>}
        {error && <span className="text-xs font-semibold text-red-700">{error}</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        <form action={lanzarMarketing}>
          <input type="hidden" name="que" value="plan" />
          <button className="rounded-lg bg-fuchsia-600 px-3 py-1.5 font-semibold text-white shadow-sm hover:bg-fuchsia-700">Proponer temas ahora</button>
        </form>
        <form action={lanzarMarketing}>
          <input type="hidden" name="que" value="redaccion" />
          <button className="rounded-lg border border-fuchsia-300 px-3 py-1.5 font-semibold text-fuchsia-800 hover:bg-fuchsia-50">Redactar el siguiente aprobado</button>
        </form>
      </div>

      <Bloque titulo={`Temas propuestos (${nPropuestos})${nAprobados ? ` · aprobados (${nAprobados})` : ''}`} vacio="Ninguno pendiente.">
        {propuestos.map((t) => (
          <li key={t.id} className="flex flex-col gap-1 border-t border-stone-100 py-2">
            <Cabecera t={t} />
            <p className="text-xs text-stone-600">{t.angulo}</p>
            {t.palabrasClave.length > 0 && <p className="text-xs text-stone-400">{t.palabrasClave.join(' · ')}</p>}
            <Informe t={t} />
            {t.estado === 'aprobado' ? (
              <form className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={t.id} />
                {t.nota && <span className="min-w-0 flex-1 text-xs text-stone-500">Nota: {t.nota}</span>}
                <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">✓ Aprobado · se redacta de jueves a sábado</span>
                <BotonTema action={descartarTemaMarketing} label="Descartar" pendiente="Descartando…" className="border border-stone-300 text-stone-600 hover:bg-stone-100" />
              </form>
            ) : (
              <form className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={t.id} />
                <input name="nota" placeholder="Nota para la banda (opcional)" className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1 text-xs" />
                <BotonTema action={aprobarTemaMarketing} label="Aprobar" pendiente="Aprobando…" className="bg-emerald-600 text-white hover:bg-emerald-700" />
                <BotonTema action={descartarTemaMarketing} label="Descartar" pendiente="Descartando…" className="border border-stone-300 text-stone-600 hover:bg-stone-100" />
              </form>
            )}
          </li>
        ))}
      </Bloque>

      <Bloque titulo={`Necesitan tu decisión (${decidir.length})`} vacio="Nada.">
        {decidir.map((t) => (
          <li key={t.id} className="flex flex-col gap-1 border-t border-stone-100 py-2">
            <Cabecera t={t} />
            {t.motivo && <p className="text-xs text-red-800">{t.motivo}</p>}
            <form className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={t.id} />
              <input name="nota" placeholder="Qué cambiar (si no, se usa el motivo)" className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1 text-xs" />
              <BotonTema action={reescribirTemaMarketing} label="Reescribir" pendiente="Enviando…" className="bg-sky-600 text-white hover:bg-sky-700" />
              <BotonTema action={descartarTemaMarketing} label="Descartar" pendiente="Descartando…" className="border border-stone-300 text-stone-600 hover:bg-stone-100" />
            </form>
          </li>
        ))}
      </Bloque>

      <Bloque titulo={`En marcha (${enMarcha.length})`} vacio="Nada en marcha.">
        {enMarcha.map((t) => (
          <li key={t.id} className="flex flex-col gap-1 border-t border-stone-100 py-2">
            <Cabecera t={t} />
            <p className="text-xs text-stone-500">Publicación prevista: {fecha(t.programadoPara)}</p>
            {t.sessionId && <Informe t={t} />}
            {t.piezas.length > 0 && (
              <p className="flex flex-wrap gap-3 text-xs">
                {t.piezas.map((p) => (
                  <span key={p.id}>
                    <b>{p.locale.toUpperCase()}</b> {p.estado}
                    {p.reviewUrl && p.estado !== 'published' && (
                      <> · <a className="underline" href={p.reviewUrl} target="_blank" rel="noreferrer">revisar</a></>
                    )}
                    {p.url && (
                      <> · <a className="underline" href={p.url} target="_blank" rel="noreferrer">ver</a></>
                    )}
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </Bloque>
    </section>
  )
}

function Cabecera({ t }: { t: TemaVista }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', ESTADO_STYLE[t.estado])}>{t.estado.replace('_', ' ')}</span>
      <b>{t.titulo}</b>
      <span className="text-xs text-stone-400">{t.destino} · {t.categoria}{t.version > 1 ? ` · v${t.version}` : ''}</span>
    </div>
  )
}

/** Informe del Profesor: plegado, para no alargar la lista. */
function Informe({ t }: { t: TemaVista }) {
  const inf = t.informe
  if (!inf) return null
  return (
    <details className="rounded border border-stone-200 bg-stone-50 px-2 py-1 text-xs text-stone-700">
      <summary className="cursor-pointer font-semibold">Informe del Profesor{inf.revisar.length ? ` · ${inf.revisar.length} punto(s) que mirar` : ''}</summary>
      {inf.resumen && <p className="mt-1">{inf.resumen}</p>}
      {inf.revisar.length > 0 && (
        <ul className="mt-1 list-disc pl-4">
          {inf.revisar.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {inf.objeciones.length > 0 && (
        <p className="mt-1 text-stone-500">
          Palermo{inf.devoluciones ? ` (${inf.devoluciones} devolución/es)` : ''}: {inf.objeciones.join(' · ')}
        </p>
      )}
      {inf.fuentes.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-2">
          Fuentes:
          {inf.fuentes.map((u, i) => (
            <a key={u} className="underline" href={u} target="_blank" rel="noreferrer">
              {i + 1}
            </a>
          ))}
        </p>
      )}
    </details>
  )
}

function Bloque({ titulo, vacio, children }: { titulo: string; vacio: string; children: React.ReactNode[] }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{titulo}</p>
      {children.length ? <ul className="text-sm">{children}</ul> : <p className="text-xs text-stone-400">{vacio}</p>}
    </div>
  )
}
