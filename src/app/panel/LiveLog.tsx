'use client'

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Codename } from '@/components/Codename'

export interface LogEvent {
  id: number
  type: string
  message: string
  codename: string | null
  createdAt: string
}

interface SessionState {
  id: string
  domain: string
  status: string
  finalReport: unknown
}

const TYPE_STYLE: Record<string, string> = {
  veto: 'bg-red-50',
  return: 'bg-amber-50',
  close: 'bg-emerald-50',
  transition_rejected: 'bg-red-100',
  agent_error: 'bg-red-100',
  session_failed: 'bg-red-100',
}

const POLL_MS = 2000

/** Log en vivo de una sesión: una línea por evento, codename coloreado. Sondea mientras la sesión esté abierta. */
export function LiveLog({ initialSession, initialEvents }: { initialSession: SessionState; initialEvents: LogEvent[] }) {
  const [session, setSession] = useState(initialSession)
  const [items, setItems] = useState(initialEvents)
  const lastId = useRef(initialEvents.at(-1)?.id ?? 0)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (session.status !== 'open') return
    let stop = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/panel/events?session=${session.id}&after=${lastId.current}`, { cache: 'no-store' })
        if (!res.ok) return
        const data: { session: SessionState; events: LogEvent[] } = await res.json()
        if (stop) return
        if (data.events.length) {
          lastId.current = data.events.at(-1)!.id
          setItems((prev) => [...prev, ...data.events])
        }
        setSession(data.session)
      } catch {
        /* siguiente intento */
      }
    }
    const id = setInterval(poll, POLL_MS)
    poll()
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [session.id, session.status])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' })
  }, [items.length])

  return (
    <section className="flex flex-col gap-2">
      <div className="max-h-[60vh] overflow-y-auto rounded border border-stone-300 bg-white">
        {items.length === 0 && <p className="p-3 text-stone-500">Sin eventos todavía.</p>}
        <ol>
          {items.map((e) => (
            <li key={e.id} className={clsx('grid grid-cols-[5.5rem_6.5rem_1fr] gap-2 border-b border-stone-100 px-3 py-1', TYPE_STYLE[e.type])}>
              <time className="text-stone-400" dateTime={e.createdAt}>
                {new Date(e.createdAt).toLocaleTimeString('es-ES', { hour12: false })}
              </time>
              <span>{e.codename ? <Codename name={e.codename} /> : <span className="text-stone-400">motor</span>}</span>
              <span className="break-words">
                <span className="text-stone-400">{e.type}</span> {e.message}
              </span>
            </li>
          ))}
        </ol>
        <div ref={bottom} />
      </div>
      {session.status === 'open' ? (
        <p className="text-stone-500">Sesión abierta · actualizando cada {POLL_MS / 1000} s</p>
      ) : (
        <details className="rounded border border-stone-300 bg-white p-3">
          <summary>
            Sesión <b>{session.status}</b> · informe final
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(session.finalReport, null, 2)}</pre>
        </details>
      )}
    </section>
  )
}
