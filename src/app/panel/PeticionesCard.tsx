import Link from 'next/link'
import clsx from 'clsx'
import type { EstadoPeticion, EstadoAviso } from '@/db/peticiones'
import type { PeticionesMetrics } from '@/lib/peticiones/metrics'
import { startPeticion } from './actions'

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
export function PeticionesCard({ m }: { m: PeticionesMetrics }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 font-bold"><span className="h-2 w-2 rounded-full bg-violet-500" />Peticiones libres</p>

      <form action={startPeticion} className="grid gap-2">
        <input name="titulo" required maxLength={200} placeholder="Título del encargo" className="rounded border border-stone-300 px-2 py-1.5" />
        <textarea name="texto" rows={5} required placeholder="La petición: qué hay que analizar y qué informe esperas…" className="rounded border border-stone-300 px-2 py-1.5" />
        <input name="webhookUrl" type="url" maxLength={500} placeholder="Webhook de aviso (opcional, https; POST con el informe y firma HMAC)" className="rounded border border-stone-300 px-2 py-1.5 text-xs" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-stone-500">La banda analiza la petición y entrega un informe (registrado y servible por la API v1).</span>
          <button type="submit" className="rounded-lg bg-violet-600 px-3 py-2 font-semibold text-white shadow-sm hover:bg-violet-700">
            Encargar análisis
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

      {m.recientes.length > 0 && (
        <ul className="text-xs">
          {m.recientes.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 border-t border-stone-100 py-1">
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
