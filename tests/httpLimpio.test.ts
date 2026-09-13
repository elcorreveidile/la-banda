import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { fetchLimpio } from '@/lib/httpLimpio'

let server: Server
let base = ''
let ultimo: { method?: string; url?: string; headers?: Record<string, string | string[] | undefined>; body?: string } = {}

beforeAll(async () => {
  server = createServer((req, res) => {
    const trozos: Buffer[] = []
    req.on('data', (c: Buffer) => trozos.push(c))
    req.on('end', () => {
      ultimo = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(trozos).toString('utf8') }
      if (req.url === '/lento') return // nunca responde: prueba el timeout
      if (req.url === '/malo') {
        res.writeHead(500, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ error: 'boom' }))
      }
      res.writeHead(202, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, eco: ultimo.body }))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const addr = server.address()
  base = typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : ''
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

describe('fetchLimpio', () => {
  it('manda método, cabeceras y cuerpo, y parsea JSON', async () => {
    const res = await fetchLimpio(`${base}/api/engine/tick?x=1`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-secret': 's' }, body: JSON.stringify({ a: 1 }) })
    expect(res.ok).toBe(true)
    expect(res.status).toBe(202)
    expect(await res.json<{ ok: boolean; eco: string }>()).toEqual({ ok: true, eco: '{"a":1}' })
    expect(ultimo.method).toBe('POST')
    expect(ultimo.url).toBe('/api/engine/tick?x=1')
    expect(ultimo.headers?.['x-engine-secret']).toBe('s')
    expect(ultimo.headers?.['content-length']).toBe('7')
    // Lo importante: no viaja ninguna traza de Vercel.
    expect(ultimo.headers?.['x-vercel-id']).toBeUndefined()
  })

  it('un 5xx es ok:false con el cuerpo disponible', async () => {
    const res = await fetchLimpio(`${base}/malo`)
    expect(res.ok).toBe(false)
    expect(res.status).toBe(500)
    expect(await res.text()).toContain('boom')
  })

  it('respeta el timeout', async () => {
    await expect(fetchLimpio(`${base}/lento`, { timeoutMs: 300 })).rejects.toThrow(/tiempo de espera/)
  })
})
