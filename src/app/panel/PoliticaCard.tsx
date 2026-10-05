import clsx from 'clsx'
import type { PoliticaMetrics } from '@/lib/politica/metrics'
import type { EstadoPoliticaPieza } from '@/db/politica'
import { etiquetaEdicion } from '@/lib/politica/calendario'
import { abrirBuloPolitica, abrirEdicionPolitica, abrirExtraPolitica, abrirVigiaPolitica, archivarPiezaPolitica, reescribirPiezaPolitica } from './actions'
import { BotonTema } from './BotonTema'

const ESTADO_STYLE: Record<EstadoPoliticaPieza, string> = {
  en_curso: 'bg-sky-100 text-sky-900',
  enviada: 'bg-violet-50 text-violet-800',
  aprobada: 'bg-teal-50 text-teal-800',
  publicada: 'bg-emerald-50 text-emerald-800',
  rechazada: 'bg-red-50 text-red-800',
  vetada: 'bg-red-50 text-red-800',
  fallida: 'bg-red-100 text-red-900',
  archivada: 'bg-stone-100 text-stone-400',
}
const ESTADO_TEXTO: Record<EstadoPoliticaPieza, string> = {
  en_curso: 'en curso', enviada: 'por revisar en el sondeo', aprobada: 'aprobada', publicada: 'publicada',
  rechazada: 'rechazada', vetada: 'vetada por Palermo', fallida: 'fallida', archivada: 'archivada',
}
const TIPO_TEXTO = { edicion: 'Edición', extra: 'Extra', bulo: 'Bulo', envio: 'Envío de visitante', vigia: 'Vigía' } as const

const fecha = (d: Date | null) => (d ? d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
const INPUT = 'w-full rounded border border-stone-300 px-2 py-1.5 text-sm'
const BTN = 'rounded bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-700'

/**
 * Pestaña Política (Con-textos 29N): las tres ediciones de hoy, abrir un extra o una comprobación de bulo,
 * y la lista de piezas con su estado. Nada se publica desde aquí: las piezas llegan PENDIENTES al sondeo.
 */
export function PoliticaCard({ m, error, aviso }: { m: PoliticaMetrics; error?: string; aviso?: string }) {
  const faltas = [!m.configuracion.modelos && 'claves de los modelos (ZAI_API_KEY)', !m.configuracion.sondeo && 'sondeo (POLITICA_URL y POLITICA_SECRET)'].filter(Boolean)
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <header>
        <h2 className="text-base font-bold">Con-textos 29N</h2>
        <p className="text-sm text-stone-500">
          Tres entregas al día verificadas (mañana 09:00, tarde 15:00, noche 21:00), extras y bulos. La banda las prepara tres horas antes;
          llegan <strong>pendientes</strong> al sondeo y una persona las aprueba. Ediciones del {m.rango.desde} al {m.rango.hasta}.
        </p>
      </header>

      {error && <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {aviso && <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}</p>}
      {faltas.length > 0 && <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">Falta configurar: {faltas.join(' y ')}. Sin eso no se abren mesas ni se envía nada.</p>}

      <div>
        <h3 className="mb-2 text-sm font-semibold">Hoy · {m.hoy.dia}</h3>
        <ul className="grid gap-2 sm:grid-cols-3">
          {m.hoy.ediciones.map((e) => (
            <li key={e.id} className="rounded-lg border border-stone-200 p-3 text-sm">
              <div className="font-semibold">{e.label} · {fecha(e.publica).split(', ').slice(-1)[0]}</div>
              {e.pieza ? (
                <span className={clsx('mt-1 inline-block rounded px-2 py-0.5 text-xs font-semibold', ESTADO_STYLE[e.pieza.estado])}>{ESTADO_TEXTO[e.pieza.estado]}</span>
              ) : (
                <form action={abrirEdicionPolitica} className="mt-1">
                  <input type="hidden" name="edicion" value={e.id} />
                  <button className="text-xs font-semibold text-teal-700 underline">Abrir ahora</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <form action={abrirExtraPolitica} className="flex flex-col gap-2 rounded-lg border border-stone-200 p-3">
          <h3 className="text-sm font-semibold">Extra (madrugada o algo que ocurre)</h3>
          <textarea name="encargo" rows={3} required minLength={10} maxLength={2000} placeholder="Qué ha pasado o qué hay que cubrir. Es solo una instrucción: la banda lo comprueba antes de contarlo." className={INPUT} />
          <select name="edicion" className={INPUT}><option value="extra">Extra (última hora)</option><option value="madrugada">Madrugada</option></select>
          <button className={BTN}>Abrir extra</button>
        </form>
        <form action={abrirBuloPolitica} className="flex flex-col gap-2 rounded-lg border border-stone-200 p-3">
          <h3 className="text-sm font-semibold">Comprobar un bulo</h3>
          <textarea name="afirmacion" rows={3} required minLength={10} maxLength={2000} placeholder="La afirmación tal cual circula (y dónde la has visto, si lo sabes)." className={INPUT} />
          <button className={BTN}>Comprobar</button>
        </form>
        <form action={abrirVigiaPolitica} className="flex flex-col gap-2 rounded-lg border border-stone-200 p-3 sm:col-span-2">
          <h3 className="text-sm font-semibold">Vigía de noticias</h3>
          <p className="text-xs text-stone-500">Cada hora (07:00-23:59) y dos veces de madrugada revisa las fuentes aprobadas; si hay novedad prepara un extra pendiente, si no, no hace nada. Se activa con POLITICA_VIGIA=1 cuando apruebes la lista de fuentes. Aquí puedes lanzar una ronda ahora.</p>
          <button className={BTN}>Revisar las fuentes ahora</button>
        </form>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Piezas recientes</h3>
        <ul className="divide-y divide-stone-100 text-sm">
          {m.piezas.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{p.titulo ?? `${TIPO_TEXTO[p.tipo]} · ${etiquetaEdicion(p.edicion)} · ${p.dia}`}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                  <span className={clsx('rounded px-2 py-0.5 font-semibold', ESTADO_STYLE[p.estado])}>{ESTADO_TEXTO[p.estado]}</span>
                  <span>{TIPO_TEXTO[p.tipo]}{p.edicion ? ` · ${etiquetaEdicion(p.edicion)}` : ''}</span>
                  {p.veredicto && <span>veredicto: {p.veredicto}</span>}
                  {p.version > 1 && <span>v{p.version}</span>}
                  {p.programadoPara && <span>sale {fecha(p.programadoPara)}</span>}
                  {p.reviewUrl && <a href={p.reviewUrl} className="text-teal-700 underline" target="_blank" rel="noopener noreferrer">revisar</a>}
                  {p.url && <a href={p.url} className="text-teal-700 underline" target="_blank" rel="noopener noreferrer">ver</a>}
                  {p.sessionId && <a href={`/panel?tab=politica&s=${p.sessionId}`} className="underline">mesa</a>}
                </div>
                {p.motivo && <p className="mt-0.5 text-xs text-red-700">{p.motivo}</p>}
              </div>
              {['rechazada', 'vetada', 'fallida'].includes(p.estado) && (
                <form className="flex shrink-0 flex-wrap items-center gap-1">
                  <input type="hidden" name="id" value={p.id} />
                  {p.tipo !== 'envio' && <input name="nota" placeholder="nota para la reescritura" className="w-40 rounded border border-stone-300 px-2 py-1 text-xs" />}
                  {p.tipo !== 'envio' && <BotonTema action={reescribirPiezaPolitica} label="Reescribir" pendiente="…" className="bg-teal-600 text-white hover:bg-teal-700" />}
                  <BotonTema action={archivarPiezaPolitica} label="Archivar" pendiente="…" className="border border-stone-300 text-stone-600 hover:bg-stone-100" />
                </form>
              )}
            </li>
          ))}
          {!m.piezas.length && <li className="py-2 text-stone-500">Todavía no hay piezas.</li>}
        </ul>
      </div>
    </section>
  )
}
