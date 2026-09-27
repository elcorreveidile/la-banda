import Link from 'next/link'
import clsx from 'clsx'
import type { EstadoSitio } from '@/db/sitios'
import type { SitiosMetrics } from '@/lib/sitios/metrics'
import { startSitio } from './actions'

const ESTADO_STYLE: Record<EstadoSitio, string> = {
  recibido: 'text-stone-500',
  entregado: 'text-emerald-700',
  error_entrega: 'text-red-700',
}

/** Tarjeta del dominio Sitios: encargo de construcción, métricas y sitios recientes. Servidor. */
export function SitiosCard({ m }: { m: SitiosMetrics }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 font-bold"><span className="h-2 w-2 rounded-full bg-orange-500" />Constructor de sitios</p>

      <form action={startSitio} className="grid gap-2">
        <input name="titulo" required maxLength={200} placeholder="Título del sitio" className="rounded border border-stone-300 px-2 py-1.5" />
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-stone-500">
            modo
            <select name="modo" defaultValue="estatico" className="rounded border border-stone-300 px-2 py-1.5 text-stone-900">
              <option value="estatico">estático (paquete descargable)</option>
              <option value="wordnext">WordNext (siembra por API)</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-stone-500">
            alcance
            <select name="alcance" defaultValue="sitio" className="rounded border border-stone-300 px-2 py-1.5 text-stone-900">
              <option value="sitio">sitio completo</option>
              <option value="paginas">páginas sobre sitio existente</option>
            </select>
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input name="tenantId" maxLength={120} placeholder="tenantId WordNext (solo alcance páginas)" className="rounded border border-stone-300 px-2 py-1.5 text-xs" />
          <input name="subdominio" maxLength={63} placeholder="subdominio (solo alcance sitio; x.wordnext.tech)" className="rounded border border-stone-300 px-2 py-1.5 text-xs" />
        </div>
        <textarea name="brief" rows={5} required placeholder="El brief del cliente: qué negocio es, qué secciones quiere, tono, datos (los que faltan se marcarán [RELLENAR])…" className="rounded border border-stone-300 px-2 py-1.5" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-stone-500">La banda construye el sitio y lo entrega; Palermo debe aprobar (la entrega es irreversible).</span>
          <button type="submit" className="rounded-lg bg-orange-600 px-3 py-2 font-semibold text-white shadow-sm hover:bg-orange-700">
            Encargar sitio
          </button>
        </div>
      </form>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-5 text-xs">
        <Stat label="sesiones" value={String(m.sessions)} />
        <Stat label="entregados" value={String(m.porEstado.entregado)} tone="text-emerald-700" />
        <Stat label="recibidos" value={String(m.porEstado.recibido)} tone="text-sky-700" />
        <Stat label="errores de entrega" value={String(m.porEstado.error_entrega)} tone="text-red-700" />
        <Stat label="devoluciones Lisboa" value={String(m.returns)} />
      </dl>

      {m.recientes.length > 0 && (
        <ul className="text-xs">
          {m.recientes.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 border-t border-stone-100 py-1">
              <b>{s.titulo}</b>
              <span className="text-stone-400">
                {s.modo} · {s.alcance}
              </span>
              <span className={clsx(ESTADO_STYLE[s.estado])}>{s.estado}</span>
              {s.entrega?.tipo === 'wordnext' && s.entrega.url && (
                <a href={s.entrega.url} target="_blank" rel="noreferrer" className="underline">
                  ver sitio
                </a>
              )}
              {s.entrega?.tipo === 'estatico' && (
                <a href={`/api/panel/sitios/${s.id}/paquete`} className="underline">
                  descargar paquete
                </a>
              )}
              {s.sessionId && (
                <Link href={`/panel?tab=sitios&s=${s.sessionId}`} className="underline">
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-stone-500">{label}</dt>
      <dd className={clsx('font-bold', tone)}>{value}</dd>
    </div>
  )
}
