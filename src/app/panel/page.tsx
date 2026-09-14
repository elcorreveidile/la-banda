import Link from 'next/link'
import clsx from 'clsx'
import { desc, eq } from 'drizzle-orm'
import { auth, signOut } from '@/lib/auth'
import { db } from '@/db'
import { sessions } from '@/db/schema'
import { Clock } from '@/components/Clock'
import { Logo } from '@/components/Logo'
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

/** Clase común de tarjeta: fondo blanco, borde suave, sombra leve y esquinas redondeadas. */
const CARD = 'rounded-xl border border-stone-200 bg-white shadow-sm'

/**
 * Pestañas del panel: una por dominio de trabajo, con su color de acento. Clases completas
 * (Tailwind no admite nombres de clase compuestos por variables). Cada pestaña filtra la
 * lista de sesiones por su dominio.
 */
const TABS = [
  { key: 'corpus', label: 'Corpus ELE', domain: 'corpus-ele', activa: 'bg-emerald-600 text-white shadow-sm', punto: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-800', borde: 'border-l-2 border-emerald-500 bg-emerald-50' },
  { key: 'trading', label: 'Trading', domain: 'trading', activa: 'bg-sky-600 text-white shadow-sm', punto: 'bg-sky-500', chip: 'bg-sky-50 text-sky-800', borde: 'border-l-2 border-sky-500 bg-sky-50' },
  { key: 'olvidos', label: 'Olvidos', domain: 'olvidos', activa: 'bg-amber-600 text-white shadow-sm', punto: 'bg-amber-500', chip: 'bg-amber-50 text-amber-900', borde: 'border-l-2 border-amber-500 bg-amber-50' },
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
  const tema = TABS.find((t) => t.key === activa)!
  const dominioActivo = tema.domain

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
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-5">
      <header className={clsx('flex flex-wrap items-center justify-between gap-3 px-4 py-2.5', CARD)}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2">
            <Logo className="h-6 w-6" />
            <span className="text-base font-bold tracking-tight">La Banda</span>
          </span>
          {elegida && (
            <span className={clsx('flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', tema.chip)}>
              <span className={clsx('h-1.5 w-1.5 rounded-full', tema.punto)} />
              {elegida.domain} · {elegida.id.slice(0, 8)}
              <span className={clsx('font-bold', STATUS_STYLE[elegida.status])}>{elegida.status}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-stone-500">
          <Clock />
          <span className="hidden sm:inline">{me?.user?.email}</span>
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/login' })
            }}
          >
            <button className="underline hover:text-stone-900">salir</button>
          </form>
        </div>
      </header>

      <nav className={clsx('flex flex-wrap gap-1 p-1', CARD)}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/panel?tab=${t.key}`}
            className={clsx(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold transition-colors',
              t.key === activa ? t.activa : 'text-stone-500 hover:bg-stone-100',
            )}
          >
            <span className={clsx('h-1.5 w-1.5 rounded-full', t.key === activa ? 'bg-white/80' : t.punto)} />
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
        <aside>
          <nav className={clsx('overflow-hidden', CARD)}>
            <p className="flex items-center gap-1.5 border-b border-stone-200 px-3 py-2 font-bold">
              <span className={clsx('h-2 w-2 rounded-full', tema.punto)} />
              Sesiones · {tema.label}
            </p>
            {recent.length === 0 && <p className="px-3 py-2 text-stone-500">Ninguna todavía.</p>}
            <ul>
              {recent.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/panel?tab=${activa}&s=${r.id}`}
                    className={clsx('flex justify-between gap-2 px-3 py-1.5 hover:bg-stone-100', elegida?.id === r.id ? tema.borde : 'border-l-2 border-transparent')}
                  >
                    <span>{r.id.slice(0, 8)}</span>
                    <span className={clsx('font-semibold', STATUS_STYLE[r.status])}>{r.status}</span>
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
              <form action={startTradingCycle} className={clsx('flex flex-col gap-2 p-4', CARD)}>
                <span className="flex items-center gap-1.5 font-bold">
                  <span className="h-2 w-2 rounded-full bg-sky-500" />
                  Ciclo de trading
                </span>
                <span className="text-xs text-stone-500">Descarga velas, gestiona posiciones y lanza a los diez agentes (igual que el cron horario).</span>
                <button type="submit" className="self-start rounded-lg bg-sky-600 px-3 py-2 font-semibold text-white shadow-sm hover:bg-sky-700 sm:py-1.5">
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
            <p className={clsx('p-4 text-stone-500', CARD)}>Lanza una sesión para ver el log.</p>
          )}
        </div>
      </div>
    </main>
  )
}
