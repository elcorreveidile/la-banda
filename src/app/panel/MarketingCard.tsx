import clsx from 'clsx'
import type { MarketingMetrics } from '@/lib/marketing/metrics'
import type { EstadoTema } from '@/db/marketing'
import { agruparPorWeb, queryVista, POR_BLOQUE, type Bloque, type FiltroVista } from '@/lib/marketing/vista'
import {
  aprobarTemaMarketing,
  archivarTemaMarketing,
  borrarTemaMarketing,
  descartarTemaMarketing,
  desarchivarTemaMarketing,
  lanzarMarketing,
  loteMarketing,
  redactarTemaMarketing,
  reescribirTemaMarketing,
} from './actions'
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
  archivado: 'bg-stone-100 text-stone-400',
}

const fecha = (d: Date | null) => (d ? d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')

type TemaVista = MarketingMetrics['temas'][number]

const BTN_GRIS = 'border border-stone-300 text-stone-600 hover:bg-stone-100'

/**
 * Pestaña Marketing: una sección plegable por web, con sus temas propuestos/aprobados (la cola de redacción),
 * los que necesitan decisión, los que están en marcha y, plegados, los descartados y archivados. Filtro por web,
 * buscador, «ver más» y limpieza (archivar, borrar y acciones en bloque) para no ahogarse en temas.
 */
export function MarketingCard({ m, error, aviso, filtro }: { m: MarketingMetrics; error?: string; aviso?: string; filtro: FiltroVista }) {
  const grupos = agruparPorWeb(m.temas, m.destinos.map((d) => d.destino), filtro)
  const volver = queryVista(filtro)
  const faltas = [!m.configuracion.modelos && 'claves de los modelos (ZAI_API_KEY)', !m.configuracion.publicacion && 'publicación en WordNext (WORDNEXT_URL y WORDNEXT_CALLBACK_SECRET)'].filter(Boolean)
  const todas = m.destinos.map((d) => d.destino)
  const abiertaPorDefecto = grupos.length === 1 || Boolean(filtro.dest) || Boolean(filtro.q?.trim())

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-1.5 font-bold"><span className="h-2 w-2 rounded-full bg-fuchsia-500" />Marketing · {m.destinos.map((d) => `${d.destino} (${d.porSemana}/sem.)`).join(' · ')}</p>
        <span className="text-xs text-stone-500">
          Cada artículo en español e inglés (salvo las webs solo en español). Jueves: la banda propone temas. Jueves a sábado: redacta los aprobados para la semana siguiente. Domingo 08:00: te llega el resumen para revisar. Búsqueda web: {m.configuracion.busqueda}.
        </span>
        {faltas.length > 0 && <span className="text-xs font-semibold text-amber-700">Falta configurar: {faltas.join(' · ')}.</span>}
        {error && <span className="text-xs font-semibold text-red-700">{error}</span>}
        {aviso && <span className="text-xs font-semibold text-emerald-700">{aviso}</span>}
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <form action={lanzarMarketing} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="volver" value={volver} />
          <label className="flex flex-col text-xs text-stone-500">
            Proponer temas para…
            <select name="destino" required defaultValue={filtro.dest ?? ''} className="rounded border border-stone-300 px-2 py-1.5 text-sm text-stone-800">
              <option value="" disabled>Elige una web</option>
              {todas.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
              <option value="*">Todas las webs (muchos temas)</option>
            </select>
          </label>
          <button className="mt-4 rounded-lg bg-fuchsia-600 px-3 py-1.5 font-semibold text-white shadow-sm hover:bg-fuchsia-700">Proponer temas ahora</button>
        </form>

        <form method="get" action="/panel" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="marketing" />
          <label className="flex flex-col text-xs text-stone-500">
            Ver
            <select name="dest" defaultValue={filtro.dest ?? ''} className="rounded border border-stone-300 px-2 py-1.5 text-sm text-stone-800">
              <option value="">Todas las webs</option>
              {todas.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-stone-500">
            Buscar
            <input name="q" defaultValue={filtro.q ?? ''} placeholder="título, ángulo, categoría…" className="rounded border border-stone-300 px-2 py-1.5 text-sm text-stone-800" />
          </label>
          <label className="flex items-center gap-1 pb-2 text-xs text-stone-600">
            <input type="checkbox" name="arch" value="1" defaultChecked={filtro.arch} /> con archivados
          </label>
          <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">Filtrar</button>
          {(filtro.dest || filtro.q || filtro.arch) && (
            <a href="/panel?tab=marketing" className="pb-2 text-xs underline">Quitar filtros</a>
          )}
        </form>
      </div>

      {grupos.length === 0 && <p className="text-xs text-stone-400">Ninguna web coincide.</p>}
      {grupos.map((g) => {
        const c = g.cuentas
        return (
          <details key={g.destino} open={abiertaPorDefecto} className="rounded-lg border border-stone-200">
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <b>{g.destino}</b>
              <Cuenta n={c.propuestos} etiqueta="propuestos" tono="bg-amber-50 text-amber-900" />
              <Cuenta n={c.aprobados} etiqueta="aprobados" tono="bg-sky-50 text-sky-800" />
              <Cuenta n={c.decidir} etiqueta="a decidir" tono="bg-red-50 text-red-800" />
              <Cuenta n={c.enMarcha} etiqueta="en marcha" tono="bg-violet-50 text-violet-800" />
              <span className="text-xs text-stone-400">{c.descartados} descartados · {c.archivados} archivados</span>
            </summary>
            <div className="flex flex-col gap-4 border-t border-stone-100 px-3 py-3">
              <div className="flex flex-wrap gap-2">
                <form className="contents">
                  <input type="hidden" name="volver" value={volver} />
                  <input type="hidden" name="destino" value={g.destino} />
                  <input type="hidden" name="que" value="descartar-propuestos" />
                  {c.propuestos > 0 && <BotonLote que="descartar-propuestos" label={`Descartar los ${c.propuestos} propuestos`} confirmar={`¿Descartar los ${c.propuestos} temas propuestos de ${g.destino}?`} />}
                </form>
                {c.descartados > 0 && <Lote destino={g.destino} volver={volver} que="archivar-descartados" label={`Archivar los ${c.descartados} descartados`} />}
                {filtro.arch && c.archivados > 0 && (
                  <Lote destino={g.destino} volver={volver} que="borrar-archivados" label={`Borrar los ${c.archivados} archivados`} confirmar={`¿Borrar para siempre los archivados de ${g.destino}? (los que tienen artículos enviados se conservan)`} />
                )}
              </div>

              <Bloque titulo={`Propuestos y aprobados (${g.pendientes.total})`} vacio="Ninguno pendiente." bloque={g.pendientes} filtro={filtro} destino={g.destino}>
                {g.pendientes.items.map((t) => (
                  <li key={t.id} className="flex flex-col gap-1 border-t border-stone-100 py-2">
                    <Cabecera t={t} />
                    <p className="text-xs text-stone-600">{t.angulo}</p>
                    {t.palabrasClave.length > 0 && <p className="text-xs text-stone-400">{t.palabrasClave.join(' · ')}</p>}
                    <Informe t={t} />
                    {t.estado === 'aprobado' ? (
                      <form className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="volver" value={volver} />
                        {t.nota && <span className="min-w-0 flex-1 text-xs text-stone-500">Nota: {t.nota}</span>}
                        <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">✓ Aprobado · en la cola de redacción</span>
                        <BotonTema action={redactarTemaMarketing} label="Redactar ahora" pendiente="Abriendo…" className="bg-sky-600 text-white hover:bg-sky-700" />
                        <BotonTema action={descartarTemaMarketing} label="Descartar" pendiente="Descartando…" className={BTN_GRIS} />
                      </form>
                    ) : (
                      <form className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="volver" value={volver} />
                        <input name="nota" placeholder="Nota para la banda (opcional)" className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1 text-xs" />
                        <BotonTema action={aprobarTemaMarketing} label="Aprobar" pendiente="Aprobando…" className="bg-emerald-600 text-white hover:bg-emerald-700" />
                        <BotonTema action={descartarTemaMarketing} label="Descartar" pendiente="Descartando…" className={BTN_GRIS} />
                      </form>
                    )}
                  </li>
                ))}
              </Bloque>

              <Bloque titulo={`Necesitan tu decisión (${g.decidir.total})`} vacio="Nada." bloque={g.decidir} filtro={filtro} destino={g.destino}>
                {g.decidir.items.map((t) => (
                  <li key={t.id} className="flex flex-col gap-1 border-t border-stone-100 py-2">
                    <Cabecera t={t} />
                    {t.motivo && <p className="text-xs text-red-800">{t.motivo}</p>}
                    <form className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="volver" value={volver} />
                      <input name="nota" placeholder="Qué cambiar (si no, se usa el motivo)" className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1 text-xs" />
                      <BotonTema action={reescribirTemaMarketing} label="Reescribir" pendiente="Enviando…" className="bg-sky-600 text-white hover:bg-sky-700" />
                      <BotonTema action={descartarTemaMarketing} label="Descartar" pendiente="Descartando…" className={BTN_GRIS} />
                      <BotonTema action={archivarTemaMarketing} label="Archivar" pendiente="Archivando…" className={BTN_GRIS} />
                    </form>
                  </li>
                ))}
              </Bloque>

              <Bloque titulo={`En marcha y publicados (${g.enMarcha.total})`} vacio="Nada en marcha." bloque={g.enMarcha} filtro={filtro} destino={g.destino}>
                {g.enMarcha.items.map((t) => (
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
                    {t.estado === 'publicado' && (
                      <form className="flex gap-2">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="volver" value={volver} />
                        <BotonTema action={archivarTemaMarketing} label="Archivar" pendiente="Archivando…" className={BTN_GRIS} />
                      </form>
                    )}
                  </li>
                ))}
              </Bloque>

              {g.descartados.total > 0 && (
                <details>
                  <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-stone-500">Descartados ({g.descartados.total})</summary>
                  <Bloque titulo="" vacio="" bloque={g.descartados} filtro={filtro} destino={g.destino}>
                    {g.descartados.items.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center gap-2 border-t border-stone-100 py-2">
                        <div className="min-w-0 flex-1"><Cabecera t={t} /></div>
                        <form className="flex gap-2">
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="volver" value={volver} />
                          <BotonTema action={archivarTemaMarketing} label="Archivar" pendiente="Archivando…" className={BTN_GRIS} />
                          <BotonTema action={borrarTemaMarketing} label="Borrar" pendiente="Borrando…" confirmar="¿Borrar este tema para siempre?" className="border border-red-300 text-red-700 hover:bg-red-50" />
                        </form>
                      </li>
                    ))}
                  </Bloque>
                </details>
              )}

              {filtro.arch && (
                <Bloque titulo={`Archivados (${g.archivados.total})`} vacio="Ninguno archivado." bloque={g.archivados} filtro={filtro} destino={g.destino}>
                  {g.archivados.items.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-2 border-t border-stone-100 py-2">
                      <div className="min-w-0 flex-1"><Cabecera t={t} /></div>
                      <form className="flex gap-2">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="volver" value={volver} />
                        <BotonTema action={desarchivarTemaMarketing} label="Recuperar" pendiente="Recuperando…" className={BTN_GRIS} />
                        <BotonTema action={borrarTemaMarketing} label="Borrar" pendiente="Borrando…" confirmar="¿Borrar este tema para siempre?" className="border border-red-300 text-red-700 hover:bg-red-50" />
                      </form>
                    </li>
                  ))}
                </Bloque>
              )}
            </div>
          </details>
        )
      })}
    </section>
  )
}

function Cuenta({ n, etiqueta, tono }: { n: number; etiqueta: string; tono: string }) {
  if (!n) return null
  return <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', tono)}>{n} {etiqueta}</span>
}

function Lote({ destino, volver, que, label, confirmar }: { destino: string; volver: string; que: string; label: string; confirmar?: string }) {
  return (
    <form className="contents">
      <input type="hidden" name="volver" value={volver} />
      <input type="hidden" name="destino" value={destino} />
      <input type="hidden" name="que" value={que} />
      <BotonLote que={que} label={label} confirmar={confirmar} />
    </form>
  )
}

function BotonLote({ label, confirmar }: { que: string; label: string; confirmar?: string }) {
  return <BotonTema action={loteMarketing} label={label} pendiente="Trabajando…" confirmar={confirmar} className={BTN_GRIS} />
}

function Cabecera({ t }: { t: TemaVista }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', ESTADO_STYLE[t.estado])}>{t.estado.replace('_', ' ')}</span>
      <b>{t.titulo}</b>
      <span className="text-xs text-stone-400">{t.categoria}{t.version > 1 ? ` · v${t.version}` : ''}</span>
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

function Bloque<T>({ titulo, vacio, bloque, filtro, destino, children }: { titulo: string; vacio: string; bloque: Bloque<T>; filtro: FiltroVista; destino: string; children: React.ReactNode[] }) {
  const faltan = bloque.total - bloque.items.length
  return (
    <div>
      {titulo && <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{titulo}</p>}
      {children.length ? <ul className="text-sm">{children}</ul> : vacio ? <p className="text-xs text-stone-400">{vacio}</p> : null}
      {faltan > 0 && (
        <a className="mt-1 inline-block text-xs underline" href={`/panel?${queryVista({ ...filtro, dest: destino, n: (filtro.n ?? POR_BLOQUE) + 20 })}`}>
          Ver más ({faltan} más)
        </a>
      )}
    </div>
  )
}
