import Link from 'next/link'
import clsx from 'clsx'
import { asc, desc, eq } from 'drizzle-orm'
import { auth, signOut } from '@/lib/auth'
import { db } from '@/db'
import { events, sessions } from '@/db/schema'
import { codenameOf } from '@/engine/store'
import { listDomains } from '@domains/index'
import { Clock } from '@/components/Clock'
import { LiveLog, type LogEvent } from './LiveLog'
import { startToySession } from './actions'

export const dynamic = 'force-dynamic'
/** El orquestador corre en `after()` de la acción; le damos margen (plan Pro de Vercel). */
export const maxDuration = 60

const STATUS_STYLE: Record<string, string> = {
  open: 'text-sky-700',
  closed: 'text-emerald-700',
  vetoed: 'text-red-700',
  failed: 'text-red-900',
}

export default async function PanelPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const me = await auth()
  const { s } = await searchParams

  const recent = await db.select().from(sessions).orderBy(desc(sessions.startedAt)).limit(20)
  const selected = (s && recent.find((r) => r.id === s)) || (s ? (await db.select().from(sessions).where(eq(sessions.id, s)).limit(1))[0] : recent[0])

  const initialEvents: LogEvent[] = selected
    ? (await db.select().from(events).where(eq(events.sessionId, selected.id)).orderBy(asc(events.id)).limit(500)).map((e) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        codename: e.agentId ? codenameOf(e.agentId) : null,
        createdAt: e.createdAt.toISOString(),
      }))
    : []

  const domains = listDomains()

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4">
      <header className="flex flex-wrap items-center justify-between gap-2 rounded border border-stone-300 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-bold">La Banda</span>
          <span>
            dominio: <b>{selected?.domain ?? '—'}</b>
          </span>
          <span>
            sesión: <b>{selected ? selected.id.slice(0, 8) : '—'}</b>
            {selected && <span className={clsx('ml-1', STATUS_STYLE[selected.status])}>{selected.status}</span>}
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

      <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
        <aside className="flex flex-col gap-4">
          <form action={startToySession} className="flex flex-col gap-2 rounded border border-stone-300 bg-white p-3">
            <span className="font-bold">Nueva sesión · toy</span>
            <input name="tema" required maxLength={300} placeholder="Tema a proponer" className="rounded border border-stone-300 px-2 py-1" />
            <button type="submit" className="rounded bg-stone-900 px-3 py-1.5 text-white hover:bg-stone-700">
              Lanzar
            </button>
            <span className="text-xs text-stone-500">Dominios cargados: {domains.map((d) => d.name).join(', ')}</span>
          </form>

          <nav className="rounded border border-stone-300 bg-white">
            <p className="border-b border-stone-200 px-3 py-2 font-bold">Sesiones</p>
            {recent.length === 0 && <p className="px-3 py-2 text-stone-500">Ninguna todavía.</p>}
            <ul>
              {recent.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/panel?s=${r.id}`}
                    className={clsx('flex justify-between gap-2 px-3 py-1 hover:bg-stone-100', selected?.id === r.id && 'bg-stone-100')}
                  >
                    <span>
                      {r.domain} · {r.id.slice(0, 8)}
                    </span>
                    <span className={STATUS_STYLE[r.status]}>{r.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {selected ? (
          <LiveLog
            key={selected.id}
            initialSession={{ id: selected.id, domain: selected.domain, status: selected.status, finalReport: selected.finalReport }}
            initialEvents={initialEvents}
          />
        ) : (
          <p className="rounded border border-stone-300 bg-white p-3 text-stone-500">Lanza una sesión para ver el log.</p>
        )}
      </div>
    </main>
  )
}
