import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { enviarWebhook, type CuerpoAviso } from '@/lib/peticiones/webhook'

const CUERPO: CuerpoAviso = {
  evento: 'informe',
  peticionId: 'p1',
  referencia: 'ref-123',
  titulo: 'Informe de prueba',
  sessionId: 's1',
  estado: 'completada',
  informe: { titulo: 'Informe de prueba', cuerpo: 'cuerpo' },
  informeUrl: 'https://labanda.test/api/v1/peticiones/p1',
  fecha: new Date(0).toISOString(),
}

function receptor(status = 200): { fetchFn: typeof fetch; peticiones: { url: string; init: RequestInit }[]; cuerpos: Record<string, unknown>[] } {
  const peticiones: { url: string; init: RequestInit }[] = []
  const cuerpos: Record<string, unknown>[] = []
  const fetchFn = (async (url: any, init: any = {}) => {
    peticiones.push({ url: String(url), init })
    cuerpos.push(JSON.parse(String(init.body)))
    return { ok: status >= 200 && status < 300, status } as Response
  }) as typeof fetch
  return { fetchFn, peticiones, cuerpos }
}

describe('webhook de peticiones', () => {
  it('envía el informe con cabeceras de evento y petición', async () => {
    const r = receptor()
    const res = await enviarWebhook('https://receptor.test/hook', CUERPO, { fetchFn: r.fetchFn })
    expect(res).toEqual({ ok: true, codigo: 200 })
    expect(r.peticiones[0].init.method).toBe('POST')
    const headers = new Headers(r.peticiones[0].init.headers as HeadersInit)
    expect(headers.get('x-la-banda-evento')).toBe('informe')
    expect(headers.get('x-la-banda-peticion')).toBe('p1')
    expect(headers.get('x-la-banda-firmado')).toBe('false')
    expect(r.cuerpos[0]).toMatchObject({ evento: 'informe', peticionId: 'p1', referencia: 'ref-123', firmado: false })
  })

  it('firma con HMAC-SHA256 cuando hay secreto', async () => {
    process.env.PETICIONES_WEBHOOK_SECRET = 'secreto-de-test'
    try {
      const r = receptor()
      await enviarWebhook('https://receptor.test/hook', CUERPO, { fetchFn: r.fetchFn })
      const headers = new Headers(r.peticiones[0].init.headers as HeadersInit)
      const firma = headers.get('x-la-banda-firma')
      expect(firma).toMatch(/^sha256=[0-9a-f]{64}$/)
      const esperada = createHmac('sha256', 'secreto-de-test').update(String(r.peticiones[0].init.body)).digest('hex')
      expect(firma).toBe(`sha256=${esperada}`)
      expect(r.cuerpos[0]).toMatchObject({ firmado: true })
    } finally {
      delete process.env.PETICIONES_WEBHOOK_SECRET
    }
  })

  it('marca como error un 5xx del receptor (para el reintento del cron)', async () => {
    const r = receptor(500)
    const res = await enviarWebhook('https://receptor.test/hook', CUERPO, { fetchFn: r.fetchFn })
    expect(res).toMatchObject({ ok: false, codigo: 500 })
  })

  it('convierte un fallo de red en error controlado, sin lanzar', async () => {
    const fetchFn = (async () => {
      throw new Error('conexión rechazada')
    }) as typeof fetch
    const res = await enviarWebhook('https://receptor.test/hook', CUERPO, { fetchFn })
    expect(res).toMatchObject({ ok: false, error: 'conexión rechazada' })
  })
})
