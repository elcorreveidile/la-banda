import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/httpLimpio', () => ({ fetchLimpio: vi.fn() }))
import { fetchLimpio, type RespuestaLimpia } from '@/lib/httpLimpio'
import { kickTick, procesarEnCadena } from '@/engine/tick'
import type { DomainConfig } from '@domains/types'
import type { Engine, StepResult } from '@/engine/orchestrator'

const respuesta = (status: number): RespuestaLimpia => ({ ok: status >= 200 && status < 300, status, statusText: '', text: async () => '', json: async <T,>() => ({}) as T })

describe('kickTick', () => {
  const fetchMock = vi.mocked(fetchLimpio)
  beforeEach(() => {
    fetchMock.mockReset()
    process.env.CRON_SECRET = 'secreto'
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('una sola llamada si el tick acepta', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(202))
    await kickTick('https://x.test', 'corpus-ele', 's1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://x.test/api/engine/tick')
    expect(init?.headers?.['x-engine-secret']).toBe('secreto')
  })

  it('reintenta una vez si falla la red y luego acepta', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce(respuesta(202))
    await kickTick('https://x.test', 'corpus-ele', 's1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('dos fallos seguidos → lanza el último error', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(500)).mockResolvedValueOnce(respuesta(502))
    await expect(kickTick('https://x.test', 'corpus-ele', 's1')).rejects.toThrow('tick 502')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  }, 10_000)
})

describe('procesarEnCadena', () => {
  const domain = { name: 'corpus-ele' } as DomainConfig
  /** Motor falso: devuelve la secuencia de StepResult dada, uno por llamada a step. */
  const motor = (secuencia: Partial<StepResult>[]) => {
    const step = vi.fn(async (_d: DomainConfig, _s: string, _o?: { deadlineMs?: number }) => ({ session: {}, done: false, ...secuencia.shift() }) as StepResult)
    return { engine: { step } as unknown as Pick<Engine, 'step'>, step }
  }

  it('encadena pasos hasta que la sesión termina', async () => {
    const { engine, step } = motor([{ done: false }, { done: false }, { done: true }])
    const pasos = await procesarEnCadena(engine, domain, 's1', { now: () => 0 })
    expect(pasos).toBe(3)
    expect(step).toHaveBeenCalledTimes(3)
    // El primer paso lleva el presupuesto entero como deadline.
    expect(step.mock.calls[0][2]).toMatchObject({ deadlineMs: expect.any(Number) })
  })

  it('para si otro tick reclamó el traspaso (skipped)', async () => {
    const { engine, step } = motor([{ done: false, skipped: true }])
    expect(await procesarEnCadena(engine, domain, 's1', { now: () => 0 })).toBe(1)
    expect(step).toHaveBeenCalledTimes(1)
  })

  it('para de encadenar cuando queda menos presupuesto que el mínimo', async () => {
    const { engine, step } = motor([{ done: false }, { done: false }, { done: false }])
    let t = 0
    // Tras el primer paso el reloj salta más allá del margen restante.
    const pasos = await procesarEnCadena(engine, domain, 's1', { budgetMs: 100, minChainMs: 90, now: () => (t += 20) })
    // now() se llama en inicio y por cada comprobación de restante; el salto deja restante < 90 pronto.
    expect(pasos).toBeGreaterThanOrEqual(1)
    expect(step.mock.calls.length).toBeLessThan(3)
  })
})
