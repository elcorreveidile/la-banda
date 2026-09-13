import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/httpLimpio', () => ({ fetchLimpio: vi.fn() }))
import { fetchLimpio, type RespuestaLimpia } from '@/lib/httpLimpio'
import { kickTick } from '@/engine/tick'

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
