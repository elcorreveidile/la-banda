/**
 * Resumen del estado de La Banda para el panel del superadmin de WordNext (puro).
 *
 * `GET /api/v1/estado` lee filas mínimas (sesiones de los últimos 7 días y revisiones del
 * firewall de los últimos 30) y este módulo las agrega. Solo cifras, ids, dominios y fechas:
 * ni traza, ni informes finales, ni fragmentos del firewall (pueden llevar texto de personas).
 */

import type { SessionStatus } from '@/db/schema'
import type { EstadoRevision, VeredictoRevision } from '@/db/firewall'

export interface FilaSesion {
  id: string
  domain: string
  status: SessionStatus
  startedAt: Date
  closedAt: Date | null
}

export interface FilaRevision {
  status: EstadoRevision
  verdict: VeredictoRevision | null
  cached: boolean
}

export interface ResumenDominio {
  dominio: string
  abiertas: number
  cerradas: number
  vetadas: number
  fallidas: number
  ultimaAt: string | null
}

export interface Estado {
  generadoAt: string
  ventanaSesionesDias: number
  ventanaFirewallDias: number
  sesiones: { abiertas: number; total: number; fallidas: number }
  dominios: ResumenDominio[]
  ultimas: { id: string; dominio: string; status: SessionStatus; startedAt: string; closedAt: string | null }[]
  fallos: { id: string; dominio: string; startedAt: string }[]
  firewall: {
    enRevision: number
    ataques: number
    falsosPositivos: number
    bloqueosPorFallo: number
    desdeCache: number
    total: number
  }
  panelUrl: string | null
}

export const VENTANA_SESIONES_DIAS = 7
export const VENTANA_FIREWALL_DIAS = 30

const iso = (d: Date | null) => (d ? d.toISOString() : null)

export function resumirEstado(input: {
  sesiones: FilaSesion[]
  revisiones: FilaRevision[]
  appUrl?: string | null
  ahora?: Date
}): Estado {
  const ses = [...input.sesiones].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
  const porDominio = new Map<string, ResumenDominio>()
  for (const s of ses) {
    const d = porDominio.get(s.domain) ?? { dominio: s.domain, abiertas: 0, cerradas: 0, vetadas: 0, fallidas: 0, ultimaAt: null }
    if (s.status === 'open') d.abiertas++
    else if (s.status === 'closed') d.cerradas++
    else if (s.status === 'vetoed') d.vetadas++
    else if (s.status === 'failed') d.fallidas++
    if (!d.ultimaAt) d.ultimaAt = s.startedAt.toISOString()
    porDominio.set(s.domain, d)
  }
  const rev = input.revisiones
  const base = input.appUrl?.trim().replace(/\/+$/, '')
  return {
    generadoAt: (input.ahora ?? new Date()).toISOString(),
    ventanaSesionesDias: VENTANA_SESIONES_DIAS,
    ventanaFirewallDias: VENTANA_FIREWALL_DIAS,
    sesiones: {
      abiertas: ses.filter((s) => s.status === 'open').length,
      total: ses.length,
      fallidas: ses.filter((s) => s.status === 'failed').length,
    },
    dominios: [...porDominio.values()].sort((a, b) => a.dominio.localeCompare(b.dominio)),
    ultimas: ses.slice(0, 8).map((s) => ({ id: s.id, dominio: s.domain, status: s.status, startedAt: s.startedAt.toISOString(), closedAt: iso(s.closedAt) })),
    fallos: ses.filter((s) => s.status === 'failed').slice(0, 5).map((s) => ({ id: s.id, dominio: s.domain, startedAt: s.startedAt.toISOString() })),
    firewall: {
      enRevision: rev.filter((r) => r.status === 'queued' || r.status === 'running').length,
      ataques: rev.filter((r) => r.status === 'done' && r.verdict === 'malicious').length,
      falsosPositivos: rev.filter((r) => r.status === 'done' && r.verdict === 'benign').length,
      bloqueosPorFallo: rev.filter((r) => r.status === 'failed').length,
      desdeCache: rev.filter((r) => r.cached).length,
      total: rev.length,
    },
    panelUrl: base ? `${base}/panel` : null,
  }
}
