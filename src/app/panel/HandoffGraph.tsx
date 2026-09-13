'use client'

import { useMemo } from 'react'
import { scalePoint } from 'd3-scale'
import { path as d3path } from 'd3-path'
import { codenameColor } from '@/components/Codename'
import { avatarInner } from '@/components/AgentAvatar'
import type { AgentView, HandoffView } from '@/lib/panel/sessionView'

const STATUS_COLOR: Record<string, string> = {
  accepted: '#0ca30c',
  returned: '#eda100',
  vetoed: '#d03b3b',
  pending: '#a8a29e',
}

const H = 190
const NODE_Y = 110
const R = 18

/**
 * Grafo de traspasos (brief §7): los agentes en el orden de la cadena;
 * cada traspaso es un arco (hacia delante por arriba, devoluciones por abajo)
 * coloreado por estado: aceptado, devuelto, vetado, pendiente.
 */
export function HandoffGraph({ agents, handoffs }: { agents: AgentView[]; handoffs: HandoffView[] }) {
  const width = Math.max(520, agents.length * 90)
  const x = useMemo(() => scalePoint<string>().domain(agents.map((a) => a.codename)).range([40, width - 40]), [agents, width])

  const arcs = handoffs
    .filter((h) => h.from && x(h.from) != null && x(h.to) != null)
    .map((h) => {
      const x1 = x(h.from!)!
      const x2 = x(h.to)!
      const back = x2 < x1
      const dist = Math.abs(x2 - x1)
      const lift = Math.min(70, 18 + dist / 4)
      const p = d3path()
      p.moveTo(x1, NODE_Y + (back ? R : -R))
      p.quadraticCurveTo((x1 + x2) / 2, NODE_Y + (back ? lift + R : -lift - R), x2, NODE_Y + (back ? R : -R))
      return { ...h, d: p.toString(), color: STATUS_COLOR[h.status] ?? STATUS_COLOR.pending }
    })

  const counts = { accepted: 0, returned: 0, vetoed: 0, pending: 0 } as Record<string, number>
  for (const h of handoffs) counts[h.status] = (counts[h.status] ?? 0) + 1

  return (
    <div className="overflow-x-auto rounded border border-stone-300 bg-white p-2">
      <svg width={width} height={H} role="img" aria-label="Grafo de traspasos">
        <defs>
          {Object.entries(STATUS_COLOR).map(([k, c]) => (
            <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
            </marker>
          ))}
        </defs>
        {arcs.map((a) => (
          <path key={a.id} d={a.d} fill="none" stroke={a.color} strokeWidth={2} markerEnd={`url(#arrow-${a.status})`} opacity={0.9}>
            <title>
              {a.from} → {a.to}: {a.status}
              {a.reason ? ` · ${a.reason}` : ''}
            </title>
          </path>
        ))}
        {agents.map((a) => (
          <g key={a.codename} transform={`translate(${x(a.codename)},${NODE_Y})`}>
            <circle r={R} fill="#fff" stroke={a.state === 'trabajando' ? '#3987e5' : a.state === 'esperando' ? '#eda100' : '#a8a29e'} strokeWidth={a.state === 'inactivo' ? 1 : 3} />
            {avatarInner(a.codename) ? (
              <g transform={`translate(${-R + 3},${-R + 3}) scale(${((R - 3) * 2) / 120})`} className={codenameColor(a.codename)} dangerouslySetInnerHTML={{ __html: avatarInner(a.codename)! }} />
            ) : (
              <text y={4} textAnchor="middle" className={`text-[10px] font-bold fill-current ${codenameColor(a.codename)}`}>
                {a.codename.slice(0, 2)}
              </text>
            )}
            <text y={R + 14} textAnchor="middle" className="text-[10px] fill-stone-600">
              {a.codename}
            </text>
          </g>
        ))}
      </svg>
      <p className="flex flex-wrap gap-3 px-1 text-xs text-stone-600">
        {(['accepted', 'returned', 'vetoed', 'pending'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="inline-block h-2 w-4" style={{ background: STATUS_COLOR[s] }} />
            {{ accepted: 'aceptados', returned: 'devueltos', vetoed: 'vetados', pending: 'pendientes' }[s]} {counts[s] ?? 0}
          </span>
        ))}
      </p>
    </div>
  )
}
