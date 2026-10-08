import Link from 'next/link'
import clsx from 'clsx'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { EstadoPeticion, EstadoAviso, Peticion } from '@/db/peticiones'
import type { InformePeticion } from '@/lib/peticiones/informe'
import type { PeticionesMetrics } from '@/lib/peticiones/metrics'
import type { Pieza, Tema } from '@/db/marketing'
import { descartarTemaMarketing, redactarTemaMarketing, reescribirTemaMarketing, startPeticion } from './actions'
import { BotonTema } from './BotonTema'

const ESTADO_STYLE: Record<EstadoPeticion, string> = {
  recibida: 'text-stone-500',
  en_curso: 'text-sky-700',
  completada: 'text-emerald-700',
  fallida: 'text-red-700',
  vetada: 'text-red-700',
}
const AVISO_STYLE: Record<EstadoAviso, string> = {
  no_aplica: 'text-stone-400',
  pendiente: 'text-amber-700',
  enviado: 'text-emerald-700',
  agotado: 'text-red-700',
}

/** Tarjeta del dominio Peticiones: encargo libre, métricas y peticiones recientes. Servidor. */
export function PeticionesCard({ m, error, aviso }: { m: PeticionesMetrics; error?: string; aviso?: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-bold">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-500" />Peticiones</span>
        {error && <span className="text-xs font-semibold text-red-700">{error}</span>}
        {aviso && <span className="text-xs font-semibold text-emerald-700">{aviso}</span>}
      </p>

      <form action={startPeticion} className="grid gap-2">
        <input name="titulo" required maxLength={200} placeholder="Título del encargo" className="rounded border border-stone-300 px-2 py-1.5" />
        <textarea name="texto" rows={5} required placeholder="La petición: qué hay que analizar y qué informe esperas…" className="rounded border border-stone-300 px-2 py-1.5" />
        <input name="webhookUrl" type="url" maxLength={500} placeholder="Webhook de aviso (opcional, https; POST con el informe y firma HMAC)" className="rounded border border-stone-300 px-2 py-1.5 text-xs" />
        <label className="grid gap-1 text-xs text-stone-600">
          Web de destino
          <select name="destino" defaultValue="" className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm">
            <option value="">Ninguna: solo un informe de análisis</option>
            {m.destinos.map((d) => (
              <option key={d} value={d}>
                Artículo para {d}
              </option>
            ))}
          </select>
          <span className="text-stone-500">
            Con una web, la banda escribe el artículo que pides, Palermo lo revisa y llega como <b>borrador al panel de esa web en WordNext</b>, donde lo revisas, lo editas y lo publicas en su blog. Sin web, entrega un informe (el webhook solo vale en este caso).
          </span>
        </label>
        <label className="grid gap-1 text-xs text-stone-600">
          Publicar el (solo con web de destino, hora de Madrid)
          <input name="publicarEn" type="datetime-local" className="rounded border border-stone-300 px-2 py-1.5 text-sm sm:w-64" />
          <span className="text-stone-500">Opcional. Sin fecha, el borrador llega sin programar y al aprobarlo en WordNext eliges tú el momento: puede ser en el mismo instante.</span>
        </label>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-stone-500">Sin destino: la banda analiza la petición y entrega un informe (registrado y servible por la API v1).</span>
          <button type="submit" className="rounded-lg bg-violet-600 px-3 py-2 font-semibold text-white shadow-sm hover:bg-violet-700">
            Enviar petición
          </button>
        </div>
      </form>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-6 text-xs">
        <Stat label="sesiones" value={String(m.sessions)} />
        <Stat label="completadas" value={String(m.porEstado.completadas)} tone="text-emerald-700" />
        <Stat label="en curso" value={String(m.porEstado.en_curso)} tone="text-sky-700" />
        <Stat label="fallidas" value={String(m.porEstado.fallidas + m.porEstado.vetadas)} tone="text-red-700" />
        <Stat label="avisos pendientes" value={String(m.avisos.pendientes)} tone="text-amber-700" />
        <Stat label="devoluciones Lisboa" value={String(m.returns)} />
      </dl>

      {m.articulos.length > 0 && (
        <div className="text-xs">
          <p className="mb-1 font-semibold text-stone-600">Artículos encargados a una web</p>
          <ul>
            {m.articulos.map((t) => (
              <li key={t.id} className="border-t border-stone-100 py-1.5">
                <ArticuloEncargado t={t} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {m.recientes.length > 0 && (
        <ul className="text-xs">
          {m.recientes.map((p) => {
            const informe = informeDe(p)
            return (
              <li key={p.id} className="border-t border-stone-100 py-1">
                <div className="flex flex-wrap items-center gap-x-3">
                  <b>{p.titulo}</b>
                  <span className={clsx(ESTADO_STYLE[p.estado])}>{p.estado}</span>
                  <span>
                    aviso: <span className={clsx(AVISO_STYLE[p.avisoEstado])}>{p.avisoEstado}</span>
                    {p.avisoIntentos > 0 && <span className="text-stone-400"> ({p.avisoIntentos})</span>}
                  </span>
                  {p.sessionId && (
                    <Link href={`/panel?s=${p.sessionId}`} className="underline">
                      sesión
                    </Link>
                  )}
                </div>
                {informe && <InformeView informe={informe} />}
              </li>
            )
          })}
        </ul>
      )}
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

/** El informe registrado, si la fila lo lleva y tiene cuerpo (el jsonb llega como unknown). */
function informeDe(p: Peticion): InformePeticion | null {
  const i = p.informe
  if (!i || typeof i !== 'object') return null
  const c = (i as Record<string, unknown>).cuerpo
  return typeof c === 'string' && c.trim() ? (i as InformePeticion) : null
}

/** Vista plegable del informe: título, resumen y cuerpo en Markdown. Servidor. */
function InformeView({ informe }: { informe: InformePeticion }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer select-none text-violet-700">ver informe</summary>
      <div className="mt-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
        <p className="font-bold">{informe.titulo}</p>
        {informe.resumenEjecutivo && <p className="mt-1 text-sm text-stone-600">{informe.resumenEjecutivo}</p>}
        <div className="prose prose-sm mt-3 max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{informe.cuerpo}</ReactMarkdown>
        </div>
        <p className="mt-3 text-xs text-stone-400">generado {new Date(informe.generadoAt).toLocaleString('es-ES')}</p>
      </div>
    </details>
  )
}

const ESTADO_ARTICULO: Record<string, string> = {
  aprobado: 'en cola',
  redactando: 'redactando',
  en_revision: 'en revisión en WordNext',
  publicado: 'publicado',
  rechazado: 'rechazado en WordNext',
  vetado: 'vetado por Palermo',
  fallido: 'fallido',
  descartado: 'descartado',
  archivado: 'archivado',
}

/** Un artículo encargado: estado, enlaces de revisión en el admin de su web y acciones. Servidor. */
function ArticuloEncargado({ t }: { t: Tema & { piezas: Pieza[] } }) {
  const cerrado = ['rechazado', 'vetado', 'fallido'].includes(t.estado)
  return (
    <form className="grid gap-1">
      <input type="hidden" name="id" value={t.id} />
      <input type="hidden" name="tab" value="peticiones" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <b>{t.titulo}</b>
        <span className="text-stone-500">{t.destino}</span>
        <span className={clsx('font-semibold', t.estado === 'publicado' ? 'text-emerald-700' : cerrado ? 'text-red-700' : 'text-sky-700')}>{ESTADO_ARTICULO[t.estado] ?? t.estado}</span>
        {t.sessionId && (
          <Link href={`/panel?tab=peticiones&s=${t.sessionId}`} className="underline">
            sesión
          </Link>
        )}
        {t.piezas.map((p) => (
          <span key={p.id}>
            {p.locale} · {p.estado}
            {p.reviewUrl && p.estado !== 'published' && (
              <>
                {' · '}
                <a className="font-semibold text-violet-700 underline" href={p.reviewUrl} target="_blank" rel="noreferrer">
                  revisar y publicar
                </a>
              </>
            )}
            {p.url && p.estado === 'published' && (
              <>
                {' · '}
                <a className="underline" href={p.url} target="_blank" rel="noreferrer">
                  ver
                </a>
              </>
            )}
          </span>
        ))}
      </div>
      {t.motivo && cerrado && <p className="text-red-700">{t.motivo}</p>}
      {cerrado && (
        <div className="flex flex-wrap items-center gap-2">
          <input name="nota" maxLength={1000} placeholder="Qué cambiar (opcional)" className="min-w-48 flex-1 rounded border border-stone-300 px-2 py-1" />
          <BotonTema action={reescribirTemaMarketing} label="Reescribir" pendiente="Enviando…" className="bg-sky-600 text-white hover:bg-sky-700" />
          <BotonTema action={descartarTemaMarketing} label="Descartar" pendiente="Descartando…" className="border border-stone-300 text-stone-700 hover:bg-stone-50" />
        </div>
      )}
      {t.estado === 'aprobado' && (
        <div className="flex flex-wrap items-center gap-2">
          <BotonTema action={redactarTemaMarketing} label="Redactar ahora" pendiente="Abriendo…" className="bg-sky-600 text-white hover:bg-sky-700" />
          <BotonTema action={descartarTemaMarketing} label="Descartar" pendiente="Descartando…" className="border border-stone-300 text-stone-700 hover:bg-stone-50" />
        </div>
      )}
    </form>
  )
}
