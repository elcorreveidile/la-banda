import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { kickTick } from '@/engine/tick'

describe('kickTick', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    process.env.CRON_SECRET = 'secreto'
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('una sola llamada si el tick acepta', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 202 }))
    await kickTick('https://x.test', 'corpus-ele', 's1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://x.test/api/engine/tick')
    expect((init.headers as Record<string, string>)['x-engine-secret']).toBe('secreto')
  })

  it('reintenta una vez si falla la red y luego acepta', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce(new Response('{}', { status: 202 }))
    await kickTick('https://x.test', 'corpus-ele', 's1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('dos fallos seguidos → lanza el último error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 })).mockResolvedValueOnce(new Response('', { status: 502 }))
    await expect(kickTick('https://x.test', 'corpus-ele', 's1')).rejects.toThrow('tick 502')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  }, 10_000)
})
