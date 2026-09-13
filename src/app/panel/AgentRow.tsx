import clsx from 'clsx'
import { codenameColor } from '@/components/Codename'
import { AgentAvatar } from '@/components/AgentAvatar'
import type { AgentView } from '@/lib/panel/sessionView'

const STATE_STYLE: Record<string, string> = {
  inactivo: 'border-stone-200 text-stone-400',
  esperando: 'border-amber-400 text-amber-700',
  trabajando: 'border-sky-500 text-sky-700 animate-pulse',
  hecho: 'border-emerald-500 text-emerald-700',
}

/** Fila de avatares con estado (brief §7). */
export function AgentRow({ agents }: { agents: AgentView[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {agents.map((a) => (
        <li key={a.codename} className={clsx('flex min-w-[6.5rem] flex-col items-center rounded border-2 bg-white px-2 py-1', STATE_STYLE[a.state])} title={a.role}>
          <AgentAvatar codename={a.codename} className="h-10 w-10" />
          <span className={clsx('text-xs font-bold', codenameColor(a.codename))}>{a.codename}</span>
          <span className="text-[10px]">{a.state}</span>
        </li>
      ))}
    </ul>
  )
}
