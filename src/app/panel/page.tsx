import Link from 'next/link'
import clsx from 'clsx'
import { desc, eq } from 'drizzle-orm'
import { auth, signOut } from '@/lib/auth'
import { db } from '@/db'
import { sessions } from '@/db/schema'
import { Clock } from '@/components/Clock'
import { SessionLive } from './SessionLive'
import { sessionView } from '@/lib/panel/sessionView'
import { startTradingCycle } from './actions'
import { tradingMetrics, type TradingMetrics } from '@/lib/trading/metrics'
import { TradingMetricsCard } from './TradingMetrics'
import { olvidosMetrics, type OlvidosMetrics } from '@/lib/olvidos/metrics'
import { objectionsForSession } from '@/lib/olvidos/manuscripts'
import { ObjectionsList, OlvidosCard } from './OlvidosCard'
import { CorpusCard } from './CorpusCard'

export const dynamic = 'force-dynamic'
/** El orquestador corre en `after()` de la acción; le damos margen (plan Pro de Vercel). */
export const maxDuration = 60

const STATUS_STYLE: Record<string, string> = {
  open: 'text-sky-700',
  closed: 'text-emerald-700',
  vetoed: 'text-red-700',
  failed: 'text-red-900',
}

/** Pestañas del panel: una por dominio de trabajo. Cada una filtra la lista de sesiones por su dominio. */
const TABS = [
  { key: 'corpus', label: 'Corpus ELE', domain: 'corpus-ele' },
  { key: 'trading', label: 'Trading', domain: 'trading' },
  { key: 'olvidos', label: 'Olvidos', domain: 'olvidos' },
] as const
type TabKey = (typeof TABS)[number]['key']

/** Dominio de una sesión → pestaña donde vive (toy y desconocidos caen en corpus). */
function tabDeDominio(domain: string | undefined): TabKey {
  return (TABS.find((t) => t.domain === domain)?.key ?? 'corpus') as TabKey
}

export default async function PanelPage({ searchParams }: { searchParams: Promise<{ s?: string; tab?: string }> }) {
  const me = await auth()
  const { s, tab } = await searchParams

  // La sesión elegida puede ser de cualquier dominio (llega por ?s=).
  const selected = s ? (await db.select().from(sessions).where(eq(sessions.id, s)).limit(1))[0] : undefined
  // Pestaña activa: la pedida, si no la de la sesión elegida, si no Corpus.
  const activa: TabKey = TABS.some((t) => t.key === tab) ? (tab as TabKey) : tabDeDominio(selected?.domain)
  const dominioActivo = TABS.find((t) => t.key === activa)!.domain

  // Lista de sesiones del dominio de la pestaña (las de trading son muchas: no mezclarlas con las de corpus).
  const recent = await db.select().from(sessions).where(eq(sessions.domain, dominioActivo)).orderBy(desc(sessions.startedAt)).limit(20)
  const elegida = selected ?? recent[0]
  const view = elegida ? await sessionView(elegida.id) : null

  // Métricas solo del dominio que se está viendo.
  let metrics: TradingMetrics | null = null
  if (activa === 'trading') {
    try {
      metrics = await tradingMetrics()
    } catch (err) {
      console.error('[la-banda] tradingMetrics', err)
    }
  }
  let olvidos: OlvidosMetrics | null = null
  if (activa === 'olvidos') {
    try {
      olvidos = await olvidosMetrics()
    } catch (err) {
      console.error('[la-banda] olvidosMetrics', err)
    }
  }
  const objections = activa === 'olvidos' && elegida?.domain === 'olvidos' ? await objectionsForSession(elegida.id).catch(() => []) : []

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4">
      <header className="flex flex-wrap items-center justify-between gap-2 rounded border border-stone-300 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-bold">La Banda</span>
          <span>
            dominio: <b>{elegida?.domain ?? '—'}</b>
          </span>
          <span>
            sesión: <b>{elegida ? elegida.id.slice(0, 8) : '—'}</b>
            {elegida && <span className={clsx('ml-1', STATUS_STYLE[elegida.status])}>{elegida.status}</span>}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Clock />
          <span className="text-stone-500">{me?.user?.email}</span>
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/login' })
            }}
          >
            <button className="text-stone-500 underline hover:text-stone-900">salir</button>
          </form>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 rounded border border-stone-300 bg-white p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/panel?tab=${t.key}`}
            className={clsx(
              'rounded px-3 py-1.5 font-bold',
              t.key === activa ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
        <aside>
          <nav className="rounded border border-stone-300 bg-white">
            <p className="border-b border-stone-200 px-3 py-2 font-bold">Sesiones · {TABS.find((t) => t.key === activa)!.label}</p>
            {recent.length === 0 && <p className="px-3 py-2 text-stone-500">Ninguna todavía.</p>}
            <ul>
              {recent.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/panel?tab=${activa}&s=${r.id}`}
                    className={clsx('flex justify-between gap-2 px-3 py-1 hover:bg-stone-100', elegida?.id === r.id && 'bg-stone-100')}
                  >
                    <span>{r.id.slice(0, 8)}</span>
                    <span className={STATUS_STYLE[r.status]}>{r.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <div className="flex flex-col gap-4">
          {activa === 'corpus' && <CorpusCard />}

          {activa === 'trading' && (
            <>
              <form action={startTradingCycle} className="flex flex-col gap-2 rounded border border-stone-300 bg-white p-3">
                <span className="font-bold">Ciclo de trading</span>
                <span className="text-xs text-stone-500">Descarga velas, gestiona posiciones y lanza a los diez agentes (igual que el cron horario).</span>
                <button type="submit" className="self-start rounded bg-stone-900 px-3 py-2 sm:py-1.5 text-white hover:bg-stone-700">
                  Lanzar ciclo ahora
                </button>
              </form>
              {metrics && <TradingMetricsCard m={metrics} />}
            </>
          )}

          {activa === 'olvidos' && (
            <>
              {olvidos && <OlvidosCard m={olvidos} />}
              <ObjectionsList items={objections} />
            </>
          )}

          {view ? (
            <SessionLive key={view.session.id} initial={view} />
          ) : (
            <p className="rounded border border-stone-300 bg-white p-3 text-stone-500">Lanza una sesión para ver el log.</p>
          )}
        </div>
      </div>
    </main>
  )
}
