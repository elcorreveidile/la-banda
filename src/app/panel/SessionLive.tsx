'use client'

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Codename } from '@/components/Codename'
import type { SessionView } from '@/lib/panel/sessionView'
import { AgentRow } from './AgentRow'
import { HandoffGraph } from './HandoffGraph'

const TYPE_STYLE: Record<string, string> = {
  veto: 'bg-red-50',
  return: 'bg-amber-50',
  close: 'bg-emerald-50',
  transition_rejected: 'bg-red-100',
  agent_error: 'bg-red-100',
  session_failed: 'bg-red-100',
}

const POLL_MS = 2000

/**
 * Vista en vivo de una sesión (brief §7): avatares con estado, grafo de traspasos
 * y log una línea por acción. Sondea mientras la sesión esté abierta.
 */
export function SessionLive({ initial }: { initial: SessionView }) {
  const [view, setView] = useState(initial)
  const lastId = useRef(initial.events.at(-1)?.id ?? 0)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (view.session.status !== 'open') return
    let stop = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/panel/events?session=${view.session.id}&after=${lastId.current}`, { cache: 'no-store' })
        if (!res.ok) return
        const data: SessionView = await res.json()
        if (stop) return
        if (data.events.length) lastId.current = data.events.at(-1)!.id
        setView((prev) => ({ ...data, events: data.events.length ? [...prev.events, ...data.events] : prev.events }))
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
  }, [view.session.id, view.session.status])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' })
  }, [view.events.length])

  return (
    <section className="flex flex-col gap-3">
      <AgentRow agents={view.agents} />
      <HandoffGraph agents={view.agents} handoffs={view.handoffs} />
      <div className="max-h-[50vh] overflow-y-auto rounded border border-stone-300 bg-white">
        {view.events.length === 0 && <p className="p-3 text-stone-500">Sin eventos todavía.</p>}
        <ol>
          {view.events.map((e) => (
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
      {view.session.status === 'open' ? (
        <p className="text-stone-500">Sesión abierta · actualizando cada {POLL_MS / 1000} s</p>
      ) : (
        <details className="rounded border border-stone-300 bg-white p-3" open>
          <summary>
            Sesión <b>{view.session.status}</b> · informe final
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(view.session.finalReport, null, 2)}</pre>
        </details>
      )}
    </section>
  )
}
