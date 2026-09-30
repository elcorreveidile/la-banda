import { describe, expect, it } from 'vitest'
import type { Tema } from '@/db/marketing'
import { cicloMarketing, decidirLote, decidirTema, redactarTema, type DepsCiclo } from '@/lib/marketing/ciclo'
import { agruparPorWeb, coincide, filtroDeQuery, queryVista, tamanoBloque } from '@/lib/marketing/vista'
import { createMarketingMemoryStore } from './marketingMemoryStore'

const A = 'banda.wordnext.tech'
const B = 'restaurante.wordnext.tech'

function entorno() {
  const mem = createMarketingMemoryStore()
  const abiertas: { kind: string; payload: Record<string, unknown> }[] = []
  let n = 0
  const d: DepsCiclo = {
    store: mem.store,
    modelosOk: () => true,
    abrirSesion: async (kind, payload) => {
      abiertas.push({ kind, payload })
      return `s${++n}`
    },
    leerSesion: async () => null,
    now: () => Date.parse('2026-10-01T10:00:00Z'),
    env: {},
  }
  let i = 0
  const tema = async (destino: string, estado: Tema['estado'], extra: Partial<Tema> = {}) =>
    mem.store.insertarTema({ id: `t${++i}`, destino, categoria: 'escritura', titulo: `Tema ${i} de ${destino}`, angulo: 'Un ángulo de prueba largo', palabrasClave: ['verso'], estado, ...extra } as never)
  return { mem, d, abiertas, tema }
}

describe('archivar, recuperar y borrar temas', () => {
  it('archiva lo que ya no está en marcha y no deja archivar lo que se está redactando', async () => {
    const { d, tema } = entorno()
    const p = await tema(A, 'propuesto')
    const r = await tema(A, 'redactando')
    expect(await decidirTema(p.id, 'archivar', null, d)).toEqual({ ok: true })
    expect((await d.store.tema(p.id))?.estado).toBe('archivado')
    expect((await decidirTema(r.id, 'archivar', null, d)).ok).toBe(false)
  })

  it('recuperar devuelve «descartado» o, si tiene artículos, el estado de sus piezas', async () => {
    const { d, mem, tema } = entorno()
    const sin = await tema(A, 'archivado')
    await decidirTema(sin.id, 'desarchivar', null, d)
    expect((await d.store.tema(sin.id))?.estado).toBe('descartado')
    const pub = await tema(A, 'archivado')
    await mem.store.insertarPieza({ id: 'p1', temaId: pub.id, version: 1, locale: 'es', titulo: 'x', externalRef: 'r1', estado: 'published' } as never)
    await decidirTema(pub.id, 'desarchivar', null, d)
    expect((await d.store.tema(pub.id))?.estado).toBe('publicado')
    expect((await decidirTema(sin.id, 'desarchivar', null, d)).ok).toBe(false)
  })

  it('borra solo propuestos, descartados o archivados SIN artículos enviados', async () => {
    const { d, mem, tema } = entorno()
    const a = await tema(A, 'descartado')
    const b = await tema(A, 'archivado')
    await mem.store.insertarPieza({ id: 'p2', temaId: b.id, version: 1, locale: 'es', titulo: 'x', externalRef: 'r2', estado: 'pending' } as never)
    const c = await tema(A, 'en_revision')
    expect((await decidirTema(a.id, 'borrar', null, d)).ok).toBe(true)
    expect(await d.store.tema(a.id)).toBeNull()
    expect((await decidirTema(b.id, 'borrar', null, d)).error).toMatch(/WordNext/)
    expect((await decidirTema(c.id, 'borrar', null, d)).ok).toBe(false)
    expect(await d.store.tema(b.id)).not.toBeNull()
  })

  it('lotes: descartar propuestos de UNA web, archivar descartados y borrar archivados', async () => {
    const { d, mem, tema } = entorno()
    await tema(A, 'propuesto')
    await tema(A, 'propuesto')
    const deB = await tema(B, 'propuesto')
    expect(await decidirLote(A, 'descartar-propuestos', d)).toEqual({ ok: true, n: 2 })
    expect((await d.store.tema(deB.id))?.estado).toBe('propuesto')
    expect((await decidirLote(A, 'archivar-descartados', d)).n).toBe(2)
    const conPieza = (await d.store.temasEnEstado(['archivado'], A))[0]
    await mem.store.insertarPieza({ id: 'p3', temaId: conPieza.id, version: 1, locale: 'es', titulo: 'x', externalRef: 'r3', estado: 'pending' } as never)
    expect((await decidirLote(A, 'borrar-archivados', d)).n).toBe(1)
    expect((await d.store.temasEnEstado(['archivado'], A)).length).toBe(1)
    expect((await decidirLote('', 'descartar-propuestos', d)).ok).toBe(false)
  })
})

describe('elegir web y tema a redactar', () => {
  it('proponer temas de UNA web abre un solo plan', async () => {
    const { d, abiertas } = entorno()
    const r = await cicloMarketing(d, { forzar: 'plan', destino: A })
    expect(r.planes).toHaveLength(1)
    expect(abiertas).toHaveLength(1)
    expect(abiertas[0].payload.destino).toBe(A)
  })

  it('redactar ESTE tema aprobado, aunque haya otros aprobados antes', async () => {
    const { d, abiertas, tema } = entorno()
    await tema(A, 'aprobado')
    const elegido = await tema(A, 'aprobado')
    const r = await redactarTema(elegido.id, d)
    expect(r.ok).toBe(true)
    expect(abiertas[0].payload.temaId).toBe(elegido.id)
    expect((await d.store.tema(elegido.id))?.estado).toBe('redactando')
  })

  it('no redacta un tema no aprobado ni dos a la vez en la misma web', async () => {
    const { d, tema } = entorno()
    const prop = await tema(A, 'propuesto')
    expect((await redactarTema(prop.id, d)).error).toMatch(/aprobado/)
    await tema(A, 'redactando')
    const otro = await tema(A, 'aprobado')
    expect((await redactarTema(otro.id, d)).error).toMatch(/en curso/)
    const deB = await tema(B, 'aprobado')
    expect((await redactarTema(deB.id, d)).ok).toBe(true)
  })
})

describe('vista de la pestaña Marketing', () => {
  const base = (destino: string, estado: Tema['estado'], titulo: string, min: number) =>
    ({ destino, estado, titulo, angulo: 'Ángulo', categoria: 'escritura', palabrasClave: ['métrica'], updatedAt: new Date(2026, 9, 1, 10, min) }) as never as Tema
  const temas = [
    base(A, 'propuesto', 'Cómo medir un verso', 1),
    base(A, 'aprobado', 'Las estrofas', 2),
    base(A, 'propuesto', 'El ritmo', 3),
    base(B, 'fallido', 'La carta', 4),
    base(B, 'archivado', 'Vieja', 5),
  ]

  it('agrupa por web, con los aprobados primero y sin archivados por defecto', () => {
    const g = agruparPorWeb(temas, [A, B])
    expect(g.map((x) => x.destino)).toEqual([A, B])
    expect(g[0].pendientes.items.map((t) => t.titulo)).toEqual(['Las estrofas', 'El ritmo', 'Cómo medir un verso'])
    expect(g[0].cuentas).toMatchObject({ propuestos: 2, aprobados: 1 })
    expect(g[1].decidir.total).toBe(1)
    expect(g[1].archivados.items).toHaveLength(0)
    expect(g[1].cuentas.archivados).toBe(1)
    expect(agruparPorWeb(temas, [A, B], { arch: true })[1].archivados.items).toHaveLength(1)
  })

  it('filtra por web y busca sin distinguir tildes ni mayúsculas', () => {
    expect(agruparPorWeb(temas, [A, B], { dest: B }).map((x) => x.destino)).toEqual([B])
    const g = agruparPorWeb(temas, [A, B], { q: 'METRICA ritmo' })
    expect(g[0].pendientes.items.map((t) => t.titulo)).toEqual(['El ritmo'])
    expect(coincide(temas[0], 'verso')).toBe(true)
    expect(coincide(temas[0], 'zzz')).toBe(false)
  })

  it('limita cada bloque y dice cuántos faltan', () => {
    const muchos = Array.from({ length: 25 }, (_, i) => base(A, 'propuesto', `Tema ${i}`, i))
    const g = agruparPorWeb(muchos, [A])[0].pendientes
    expect(g.items).toHaveLength(10)
    expect(g.total).toBe(25)
    expect(agruparPorWeb(muchos, [A], { n: 30 })[0].pendientes.items).toHaveLength(25)
    expect(tamanoBloque('9999')).toBe(200)
    expect(tamanoBloque('x')).toBe(10)
  })

  it('el filtro viaja por la URL y solo se leen sus campos', () => {
    const q = queryVista({ dest: A, q: 'verso', arch: true, n: 30 }, { aviso: 'hecho' })
    expect(q).toContain('tab=marketing')
    expect(q).toContain('aviso=hecho')
    expect(filtroDeQuery(q)).toEqual({ dest: A, q: 'verso', arch: true, n: 30 })
    expect(filtroDeQuery('tab=trading&s=abc&error=x&dest=a.b&evil=1')).toEqual({ dest: 'a.b', q: undefined, arch: false, n: undefined })
  })
})
