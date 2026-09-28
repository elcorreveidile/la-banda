import { describe, expect, it } from 'vitest'
import { resumirEstado, type FilaSesion } from '@/lib/estado'

const d = (h: number) => new Date(Date.UTC(2026, 8, 28, h))
const s = (id: string, domain: string, status: FilaSesion['status'], h: number): FilaSesion => ({ id, domain, status, startedAt: d(h), closedAt: status === 'open' ? null : d(h + 1) })

describe('resumen de estado para WordNext', () => {
  it('agrega sesiones por dominio, ordena y limita', () => {
    const e = resumirEstado({
      sesiones: [s('a', 'trading', 'closed', 1), s('b', 'trading', 'open', 5), s('c', 'firewall', 'vetoed', 3), s('f', 'corpus-ele', 'failed', 4)],
      revisiones: [],
      appUrl: 'https://kupeku.com/',
      ahora: d(6),
    })
    expect(e.sesiones).toEqual({ abiertas: 1, total: 4, fallidas: 1 })
    expect(e.dominios.map((x) => x.dominio)).toEqual(['corpus-ele', 'firewall', 'trading'])
    expect(e.dominios.find((x) => x.dominio === 'trading')).toMatchObject({ abiertas: 1, cerradas: 1, ultimaAt: d(5).toISOString() })
    expect(e.ultimas[0].id).toBe('b')
    expect(e.fallos).toEqual([{ id: 'f', dominio: 'corpus-ele', startedAt: d(4).toISOString() }])
    expect(e.panelUrl).toBe('https://kupeku.com/panel')
    expect(e.generadoAt).toBe(d(6).toISOString())
  })

  it('cuenta el firewall: en revisión, ataques, falsos positivos, bloqueos por fallo y caché', () => {
    const e = resumirEstado({
      sesiones: [],
      revisiones: [
        { status: 'queued', verdict: null, cached: false },
        { status: 'running', verdict: null, cached: false },
        { status: 'done', verdict: 'malicious', cached: false },
        { status: 'done', verdict: 'malicious', cached: true },
        { status: 'done', verdict: 'benign', cached: false },
        { status: 'failed', verdict: 'malicious', cached: false },
      ],
    })
    expect(e.firewall).toEqual({ enRevision: 2, ataques: 2, falsosPositivos: 1, bloqueosPorFallo: 1, desdeCache: 1, total: 6 })
    expect(e.panelUrl).toBeNull()
  })

  it('no expone contenido: solo ids, dominios, estados y fechas', () => {
    const e = resumirEstado({ sesiones: [s('x', 'olvidos', 'closed', 2)], revisiones: [] })
    expect(Object.keys(e.ultimas[0]).sort()).toEqual(['closedAt', 'dominio', 'id', 'startedAt', 'status'])
  })
})
