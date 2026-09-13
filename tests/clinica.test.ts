import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as clinica from '@/lib/clinica'
import { medirTexto } from '@/lib/corpus/medir'

const ENV = { CLINICA_URL: 'https://clinica.test/', CLINICA_CORPUS_KEY: 'clave-de-prueba' }

describe('cliente de la Clínica', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    process.env.CLINICA_URL = ENV.CLINICA_URL
    process.env.CLINICA_CORPUS_KEY = ENV.CLINICA_CORPUS_KEY
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.CLINICA_URL
    delete process.env.CLINICA_CORPUS_KEY
  })

  it('sin variables no llama a la red y devuelve error', async () => {
    delete process.env.CLINICA_CORPUS_KEY
    expect(clinica.hasClinica()).toBe(false)
    const r = await clinica.etiquetario()
    expect(clinica.esError(r)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('manda Bearer y recorta la barra final de CLINICA_URL', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ version: 1, capas: [], etiquetas: [] }), { status: 200 }))
    const r = await clinica.etiquetario()
    expect(clinica.esError(r)).toBe(false)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://clinica.test/api/corpus/etiquetario')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer clave-de-prueba')
  })

  it('buscarPiezas construye la query y crearPieza hace POST', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ piezas: [] }), { status: 200 }))
    await clinica.buscarPiezas({ nivel: 'A2', situacion: 'bar', take: 3 })
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('https://clinica.test/api/corpus/piezas?nivel=A2&situacion=bar&take=3')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, pieza: { id: 'x', estado: 'validada' } }), { status: 201 }))
    const r = await clinica.crearPieza({ tipo: 'muestra_habla', titulo: 'En el bar', texto: 'Un café, por favor.', nivel: 'A1', procedencia: 'generada' })
    expect(r).toMatchObject({ ok: true, pieza: { id: 'x' } })
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toMatchObject({ procedencia: 'generada' })
  })

  it('401 / 503 de la Clínica vuelven como { error } con el mensaje', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 }))
    expect(await clinica.pcic('funciones')).toEqual({ error: 'Clínica 401: no autorizado' })
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503, statusText: 'Service Unavailable' }))
    const r = await clinica.produccionesPendientes(2)
    expect(clinica.esError(r) && r.error).toMatch(/503/)
  })

  it('un fallo de red no lanza', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'))
    expect(await clinica.escribirAnotaciones({ produccionTipo: 'redaccion', produccionRef: 'r', anotaciones: [] })).toEqual({ error: 'Clínica: ECONNRESET' })
  })
})

describe('medirTexto', () => {
  it('es determinista y sugiere banda A para un texto corto', () => {
    const m = medirTexto('Hola. Me llamo Ana. Vivo en Granada.')
    expect(m).toEqual(medirTexto('Hola. Me llamo Ana. Vivo en Granada.'))
    expect(m.palabras).toBe(7)
    expect(m.frases).toBe(3)
    expect(m.bandaSugerida).toBe('A')
  })

  it('sube a B con pasados y conectores en un texto medio', () => {
    const texto = ('Ayer fui al bar con mis amigos y pedimos tapas. Sin embargo, el camarero tardó mucho porque había mucha gente. ' + 'Luego paseamos por el Albaicín y vimos la Alhambra desde el mirador. ').repeat(3)
    const m = medirTexto(texto)
    expect(m.palabras).toBeGreaterThanOrEqual(80)
    expect(m.marcas.pasados).toBeGreaterThanOrEqual(2)
    expect(m.marcas.conectores).toBeGreaterThanOrEqual(1)
    expect(m.bandaSugerida).toBe('B')
  })

  it('texto vacío no divide por cero', () => {
    expect(medirTexto('')).toMatchObject({ palabras: 0, riquezaLexica: 0, bandaSugerida: 'A' })
  })
})
