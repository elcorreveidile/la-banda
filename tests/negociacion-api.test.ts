import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { manejarAbrir, manejarAltaNodo, manejarBajaNodo, manejarBuscarNodos, manejarDecision, manejarGet } from '@/lib/negociacion/api'
import { createRedMemoryStore } from './redMemoryStore'

const KEY = 'clave-api'
const req = (method: string, body?: unknown, headers: Record<string, string> = {}, url = 'http://x/api/v1/red/nodos') =>
  new Request(url, { method, headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })

const nodo = (tenantId: string, catalogo: unknown[] = []) => ({
  tenantId,
  host: `${tenantId}.wordnext.tech`,
  nombre: tenantId,
  sector: 'servicios',
  capacidades: ['quote'],
  catalogo,
  limites: { descuentoMaxPct: 15, rondasMax: 2 },
})
const CAT = [{ id: 'sesion', tipo: 'servicio', nombre: 'Sesión de coaching', precioCents: 12_000, minimoCents: 10_000 }]

describe('API v1 de la red de webs', () => {
  const prev = process.env.LA_BANDA_API_KEY
  beforeEach(() => {
    process.env.LA_BANDA_API_KEY = KEY
  })
  afterEach(() => {
    process.env.LA_BANDA_API_KEY = prev
  })

  it('alta, descubrimiento sin datos privados, actualización con clave y baja', async () => {
    const { store } = createRedMemoryStore()
    expect((await manejarAltaNodo(new Request('http://x', { method: 'POST', body: '{}' }), store)).status).toBe(401)
    expect((await manejarAltaNodo(req('POST', { tenantId: 'x' }), store)).status).toBe(400)
    const alta = await manejarAltaNodo(req('POST', nodo('coach', CAT)), store)
    expect(alta.status).toBe(201)
    const a = await alta.json()
    expect(a.clave).toMatch(/^bn_/)
    expect(JSON.stringify(a.nodo)).not.toMatch(/minimo|limites|clave/i)

    expect((await manejarAltaNodo(req('POST', nodo('coach', CAT)), store)).status).toBe(403)
    const upd = await manejarAltaNodo(req('POST', { ...nodo('coach', CAT), nombre: 'Coach 2' }, { 'x-banda-nodo-clave': a.clave }), store)
    expect(upd.status).toBe(200)
    expect((await upd.json()).clave).toBeUndefined()

    const busca = await (await manejarBuscarNodos(req('GET', undefined, {}, 'http://x/api/v1/red/nodos?capacidad=quote&sector=servicios'), store)).json()
    expect(busca.nodos.map((n: { nombre: string }) => n.nombre)).toEqual(['Coach 2'])
    expect(JSON.stringify(busca)).not.toMatch(/minimoCents|descuentoMax/)

    expect((await manejarBajaNodo(req('DELETE'), a.nodo.id, store)).status).toBe(403)
    expect((await manejarBajaNodo(req('DELETE', undefined, { 'x-banda-nodo-clave': a.clave }), a.nodo.id, store)).status).toBe(200)
    expect((await (await manejarBuscarNodos(req('GET'), store)).json()).nodos).toEqual([])
  })

  it('abrir (solo el comprador con su clave), consultar (solo las partes) y decidir', async () => {
    const { store } = createRedMemoryStore()
    const v = await (await manejarAltaNodo(req('POST', nodo('coach', CAT)), store)).json()
    const c = await (await manejarAltaNodo(req('POST', nodo('empresa')), store)).json()
    const x = await (await manejarAltaNodo(req('POST', nodo('otro')), store)).json()
    const cuerpo = { compradorNodoId: c.nodo.id, vendedorNodoId: v.nodo.id, texto: 'Tres sesiones para el equipo directivo.', lineas: [{ itemId: 'sesion', cantidad: 3 }], presupuestoMaxCents: 20_000, referencia: 'wn-9' }
    const deps = { store, abrirMesa: async () => 's-1', lanzar: () => {}, modelosOk: () => true }

    expect((await manejarAbrir(req('POST', cuerpo), deps)).status).toBe(403)
    expect((await manejarAbrir(req('POST', { ...cuerpo, lineas: [{ itemId: 'nada', cantidad: 1 }] }, { 'x-banda-nodo-clave': c.clave }), deps)).status).toBe(400)
    // Sin zona (3 × 10.200 > 20.000): 202 ya cerrada.
    const sinZona = await manejarAbrir(req('POST', cuerpo, { 'x-banda-nodo-clave': c.clave }), deps)
    expect(sinZona.status).toBe(202)
    const sz = await sinZona.json()
    expect(sz).toMatchObject({ estado: 'sin_acuerdo', referencia: 'wn-9', moneda: 'EUR' })
    expect(JSON.stringify(sz)).not.toMatch(/presupuestoMax|minimo/)

    let lanzadas = 0
    const ok = await manejarAbrir(req('POST', { ...cuerpo, presupuestoMaxCents: 36_000 }, { 'x-banda-nodo-clave': c.clave }), { ...deps, lanzar: () => void lanzadas++ })
    expect(ok.status).toBe(202)
    const neg = await ok.json()
    expect(neg.estado).toBe('negociando')
    expect(lanzadas).toBe(1)
    expect((await manejarAbrir(req('POST', cuerpo, { 'x-banda-nodo-clave': c.clave }), { ...deps, modelosOk: () => false, store })).status).toBe(202) // sin zona no necesita modelos
    expect((await manejarAbrir(req('POST', { ...cuerpo, presupuestoMaxCents: 36_000 }, { 'x-banda-nodo-clave': c.clave }), { ...deps, modelosOk: () => false })).status).toBe(503)

    const get = (nodoId: string, clave: string) => manejarGet(req('GET', undefined, { 'x-banda-nodo': nodoId, 'x-banda-nodo-clave': clave }), neg.id, store)
    expect((await get(x.nodo.id, x.clave)).status).toBe(403)
    expect((await get(v.nodo.id, 'mala')).status).toBe(403)
    expect(await (await get(v.nodo.id, v.clave)).json()).toMatchObject({ id: neg.id, tuParte: 'vendedor' })
    // Aún no hay propuesta: aprobar es un conflicto.
    expect((await manejarDecision(req('POST', undefined, { 'x-banda-nodo': c.nodo.id, 'x-banda-nodo-clave': c.clave }), neg.id, 'aprobar', { store })).status).toBe(409)
  })
})
