import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { marketingDomain } from '@domains/marketing/config'
import { validateDomain } from '@domains/types'
import { contarPalabras, problemasHtml, validarArticulo, validarTemas } from '@/lib/marketing/articulo'
import { esDiaDePlan, esDiaDeRedaccion, esHoraDeResumen, huecosSemanaSiguiente, lunesSemanaSiguiente, madridAUtc } from '@/lib/marketing/calendario'
import { abrirRedaccion, aplicarAviso, cicloMarketing, componerResumen, datosResumen, decidirTema, enviarArticulo, estadoPorPiezas, finalizarSesion, registrarTemas, type DepsCiclo } from '@/lib/marketing/ciclo'
import { modeloJuez, modeloRedactor, modelosDisponibles, revisorEmail } from '@/lib/marketing/config'
import { avisoFirmado, claveTraduccion, enviarPieza, firmaPlataforma, leerVistaPieza, refPieza, type EnvioPieza } from '@/lib/marketing/wordnext'
import { leerRespuestaBusqueda } from '@/lib/marketing/busqueda'
import { leerInforme, resultadoDeCierre } from '@/lib/marketing/informe'
import { createMarketingMemoryStore } from './marketingMemoryStore'

const DESTINO = 'blog.wordnext.tech'
// 2026-10-01 es jueves; 2026-10-04 domingo; 2026-10-25 acaba el horario de verano.
const JUEVES_10H = madridAUtc(2026, 10, 1, 10)
const VIERNES = madridAUtc(2026, 10, 2, 12)
const DOMINGO_8H = madridAUtc(2026, 10, 4, 8, 5)
const LUNES = madridAUtc(2026, 10, 5, 10)

function parrafos(n: number, palabra = 'texto'): string {
  return Array.from({ length: n }, (_, i) => `<p>${Array.from({ length: 50 }, () => palabra).join(' ')} ${i}.</p>`).join('')
}
const html = `<h2>Primera sección</h2>${parrafos(8)}<h2>Segunda sección</h2>${parrafos(8)}<p>Más en <a href="https://www.wordnext.tech">WordNext</a>.</p>`
const articulo = (slug: string) => ({ titulo: 'Cómo llenar mesas entre semana', slug, extracto: 'Ideas concretas para que un restaurante llene mesas de lunes a jueves sin regalar el margen.', seoTitulo: 'Llenar mesas entre semana', seoDescripcion: 'Ideas concretas para llenar mesas de lunes a jueves.', html })

describe('dominio marketing', () => {
  it('pasa validateDomain y el grafo cubre plan y artículo', () => {
    expect(() => validateDomain(marketingDomain)).not.toThrow()
    expect(marketingDomain.transitions.Denver).toEqual(['Río', 'Palermo'])
    expect(marketingDomain.closer).toBe('Profesor')
    expect(marketingDomain.transitions.Helsinki).toEqual(['Profesor'])
    expect(marketingDomain.agents.find((a) => a.codename === 'Profesor')?.tools).toEqual(['leerCadena'])
    expect(marketingDomain.agents.find((a) => a.codename === 'Palermo')?.canVeto).toBe(true)
    expect(marketingDomain.agents.find((a) => a.codename === 'Río')?.tools).not.toContain('enviarArticulo')
  })

  it('modelos: Río con Fable, Palermo con Opus 5.5, y z.ai solo si se pide', () => {
    expect(modeloRedactor({})).toBe('anthropic:claude-fable-5-1')
    expect(modeloJuez({})).toBe('anthropic:claude-opus-5-5')
    expect(modeloRedactor({ MARKETING_MODELO_REDACTOR: 'claude-opus-5' })).toBe('anthropic:claude-opus-5')
    expect(modelosDisponibles({ ZAI_API_KEY: 'x' })).toBe(false)
    expect(modelosDisponibles({ ANTHROPIC_API_KEY: 'x' })).toBe(true)
  })

  it('el resumen nunca va al buzón que no existe', () => {
    expect(revisorEmail({})).toBe('informa@blablaele.com')
    expect(revisorEmail({ MARKETING_REVISOR_EMAIL: 'javier@blablaele.com' })).toBe('informa@blablaele.com')
    expect(revisorEmail({ MARKETING_REVISOR_EMAIL: 'benitezl@go.ugr.es' })).toBe('benitezl@go.ugr.es')
  })
})

describe('calendario semanal (hora de Madrid)', () => {
  it('jueves propone, jueves-sábado redacta, domingo a las 8 resume', () => {
    expect(esDiaDePlan(JUEVES_10H)).toBe(true)
    expect(esDiaDePlan(VIERNES)).toBe(false)
    expect(esDiaDeRedaccion(VIERNES)).toBe(true)
    expect(esDiaDeRedaccion(LUNES)).toBe(false)
    expect(esHoraDeResumen(DOMINGO_8H)).toBe(true)
    expect(esHoraDeResumen(madridAUtc(2026, 10, 4, 9))).toBe(false)
  })

  it('huecos de la semana siguiente: martes y jueves a las 09:00 de Madrid, también con el cambio de hora', () => {
    expect(lunesSemanaSiguiente(VIERNES)).toEqual({ y: 2026, m: 10, d: 5 })
    expect(lunesSemanaSiguiente(DOMINGO_8H)).toEqual({ y: 2026, m: 10, d: 5 })
    expect(huecosSemanaSiguiente(VIERNES, 2).map((d) => d.toISOString())).toEqual(['2026-10-06T07:00:00.000Z', '2026-10-08T07:00:00.000Z'])
    // Semana del 26-10 (horario de invierno, UTC+1).
    expect(huecosSemanaSiguiente(madridAUtc(2026, 10, 23, 12), 2).map((d) => d.toISOString())).toEqual(['2026-10-27T08:00:00.000Z', '2026-10-29T08:00:00.000Z'])
    expect(huecosSemanaSiguiente(VIERNES, 3)).toHaveLength(3)
  })
})

describe('validación en código', () => {
  it('temas: categoría de la lista, longitudes y sin repetir', () => {
    const { temas, descartes } = validarTemas(
      [
        { categoria: 'restauracion', titulo: 'Cómo llenar mesas entre semana', angulo: 'Ideas para restaurantes que pierden entre semana.', palabrasClave: ['llenar restaurante'] },
        { categoria: 'inventada', titulo: 'Un tema cualquiera largo', angulo: 'Un ángulo suficientemente largo.' },
        { categoria: 'firewall-ia', titulo: 'CÓMO llenar mesas entre semana!', angulo: 'Repetido con otras mayúsculas y signos.' },
        { categoria: 'salud', titulo: 'Corto', angulo: 'x' },
      ],
      4,
    )
    expect(temas).toHaveLength(1)
    expect(descartes).toHaveLength(3)
  })

  it('artículo: etiquetas permitidas, enlaces https, sin h1, dos h2 y longitud', () => {
    expect(contarPalabras(html)).toBeGreaterThan(600)
    expect(validarArticulo(articulo('llenar-mesas')).ok).toBe(true)
    expect(problemasHtml('<h1>x</h1><img src="a"><a href="javascript:alert(1)">x</a><p style="color:red">y</p>')).toEqual(
      expect.arrayContaining(['etiqueta no permitida <h1>', 'etiqueta no permitida <img>', expect.stringContaining('enlace no https'), 'atributo no permitido style en <p>']),
    )
    const r = validarArticulo({ ...articulo('Slug Malo'), html: '<p>corto</p>' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.join(' ')).toMatch(/slug.*h2|slug/)
  })
})

function deps(extra: Partial<DepsCiclo> & { now?: () => number } = {}) {
  const mem = createMarketingMemoryStore()
  const abiertas: { kind: string; payload: Record<string, unknown> }[] = []
  const envios: EnvioPieza[] = []
  const correos: { asunto: string; html: string; texto: string }[] = []
  const sesiones = new Map<string, { status: string; finalReport: unknown }>()
  let n = 0
  const d: DepsCiclo = {
    store: mem.store,
    modelosOk: () => true,
    abrirSesion: async (kind, payload) => {
      abiertas.push({ kind, payload })
      const id = `s${++n}`
      sesiones.set(id, { status: 'open', finalReport: null })
      return id
    },
    leerSesion: async (id) => sesiones.get(id) ?? null,
    enviar: async (p) => {
      envios.push(p)
      return { ok: true, duplicada: false, vista: { id: `wn-${p.externalRef}`, status: 'pending', externalRef: p.externalRef, url: null, reviewUrl: `https://${p.tenant}/admin/publicaciones/wn-${p.locale}`, scheduledAt: p.scheduledAt, publishedAt: null, feedback: null } }
    },
    enviarCorreo: async (c) => {
      correos.push(c)
    },
    env: { APP_URL: 'https://kupeku.com' },
    ...extra,
  }
  return { d, mem, abiertas, envios, correos, sesiones }
}

async function temaAprobado(ctx: ReturnType<typeof deps>, titulo = 'Cómo llenar mesas entre semana') {
  const r = await registrarTemas({ kind: 'plan', destino: DESTINO, cuantos: 4 }, `plan-${titulo}`, [{ categoria: 'restauracion', titulo, angulo: 'Ideas para restaurantes que pierden entre semana.' }], { store: ctx.mem.store })
  expect(r).toMatchObject({ registrados: 1 })
  const t = (await ctx.mem.store.temasEnEstado(['propuesto'])).find((x) => x.titulo === titulo)!
  expect((await decidirTema(t.id, 'aprobar', 'Céntrate en bares de barrio', { store: ctx.mem.store })).ok).toBe(true)
  return (await ctx.mem.store.tema(t.id))!
}

const dossierAprobado = (slug: string) => [{ veredictoPalermo: { aprueba: true, motivos: [] } }, { articuloEn: articulo(`${slug}-en`) }, { articuloEs: articulo(slug) }]

describe('ciclo: del tema aprobado al artículo publicado', () => {
  it('registrarTemas solo en un plan y una vez por sesión', async () => {
    const ctx = deps()
    expect(await registrarTemas({ kind: 'articulo' }, 's', [], { store: ctx.mem.store })).toMatchObject({ error: expect.any(String) })
    await temaAprobado(ctx)
    const otra = await registrarTemas({ kind: 'plan', destino: DESTINO }, 'plan-Cómo llenar mesas entre semana', [], { store: ctx.mem.store })
    expect(otra).toMatchObject({ error: expect.stringContaining('ya están registrados') })
  })

  it('redacción: huecos martes y jueves; sin hueco no abre mesa', async () => {
    const ctx = deps({ now: () => VIERNES.getTime() })
    const a = await temaAprobado(ctx, 'Tema uno para la semana que viene')
    const b = await temaAprobado(ctx, 'Tema dos para la semana que viene')
    const c = await temaAprobado(ctx, 'Tema tres para la semana que viene')
    const ra = await abrirRedaccion(a, ctx.d)
    const rb = await abrirRedaccion(b, ctx.d)
    expect(ra).toMatchObject({ tipo: 'abierta' })
    expect(rb).toMatchObject({ tipo: 'abierta' })
    if (ra.tipo === 'abierta' && rb.tipo === 'abierta') expect([ra.programadoPara.toISOString(), rb.programadoPara.toISOString()]).toEqual(['2026-10-06T07:00:00.000Z', '2026-10-08T07:00:00.000Z'])
    expect(await abrirRedaccion(c, ctx.d)).toEqual({ tipo: 'sin-hueco' })
    expect(ctx.abiertas.map((x) => x.kind)).toEqual(['articulo', 'articulo'])
    expect(await abrirRedaccion((await ctx.mem.store.tema(a.id))!, ctx.d)).toEqual({ tipo: 'no-aprobado' })
  })

  it('envío: exige a Palermo, valida y manda ES + EN enlazados y programados; idempotente', async () => {
    const ctx = deps({ now: () => VIERNES.getTime() })
    const t0 = await temaAprobado(ctx)
    await abrirRedaccion(t0, ctx.d)
    const t = (await ctx.mem.store.tema(t0.id))!

    const sinPalermo = await enviarArticulo(t, [{ articuloEs: articulo('a') }, { articuloEn: articulo('b') }], ctx.d)
    expect(sinPalermo).toMatchObject({ ok: false, error: 'sin veredicto de Palermo en el dossier' })
    const noAprueba = await enviarArticulo(t, [{ veredictoPalermo: { aprueba: false, motivos: ['cifra sin fuente'] } }], ctx.d)
    expect(noAprueba.error).toContain('cifra sin fuente')
    const malo = await enviarArticulo(t, [{ veredictoPalermo: { aprueba: true } }, { articuloEs: { ...articulo('a'), html: '<h1>x</h1>' } }, { articuloEn: articulo('b') }], ctx.d)
    expect(malo).toMatchObject({ ok: false, error: 'el artículo no pasa la validación en código' })
    expect(ctx.envios).toHaveLength(0)

    const ok = await enviarArticulo(t, dossierAprobado('llenar-mesas'), ctx.d)
    expect(ok.ok).toBe(true)
    expect(ctx.envios.map((e) => [e.locale, e.externalRef, e.translationKey, e.scheduledAt, e.tenant])).toEqual([
      ['es', refPieza(t.id, 1, 'es'), claveTraduccion(t.id), '2026-10-06T07:00:00.000Z', DESTINO],
      ['en', refPieza(t.id, 1, 'en'), claveTraduccion(t.id), '2026-10-06T07:00:00.000Z', DESTINO],
    ])
    expect((await ctx.mem.store.tema(t.id))!.estado).toBe('en_revision')
    // Un segundo intento (reintento de Helsinki) no reenvía.
    await enviarArticulo((await ctx.mem.store.tema(t.id))!, dossierAprobado('llenar-mesas'), ctx.d)
    expect(ctx.envios).toHaveLength(2)
  })

  it('avisos de WordNext: aprobado → publicado; rechazado con motivo; reescribir sube la versión', async () => {
    const ctx = deps({ now: () => VIERNES.getTime() })
    const t0 = await temaAprobado(ctx)
    await abrirRedaccion(t0, ctx.d)
    await enviarArticulo((await ctx.mem.store.tema(t0.id))!, dossierAprobado('llenar-mesas'), ctx.d)
    const vista = (locale: string, status: 'approved' | 'published' | 'rejected', feedback: string | null = null) => ({ id: `wn-${refPieza(t0.id, 1, locale)}`, status, externalRef: refPieza(t0.id, 1, locale), url: status === 'published' ? `https://${DESTINO}/x-${locale}` : null, reviewUrl: null, scheduledAt: null, publishedAt: null, feedback })

    await aplicarAviso(vista('es', 'published'), ctx.d)
    expect((await ctx.mem.store.tema(t0.id))!.estado).toBe('en_revision')
    const r = await aplicarAviso(vista('en', 'published'), ctx.d)
    expect(r).toMatchObject({ ok: true, estado: 'publicado' })

    expect(await aplicarAviso({ ...vista('es', 'approved'), id: 'otra', externalRef: 'ajena' }, ctx.d)).toEqual({ ok: false })

    const ctx2 = deps({ now: () => VIERNES.getTime() })
    const t1 = await temaAprobado(ctx2)
    await abrirRedaccion(t1, ctx2.d)
    await enviarArticulo((await ctx2.mem.store.tema(t1.id))!, dossierAprobado('otro'), ctx2.d)
    await aplicarAviso({ ...vista('es', 'rejected', 'Demasiado genérico'), id: `wn-${refPieza(t1.id, 1, 'es')}`, externalRef: refPieza(t1.id, 1, 'es') }, ctx2.d)
    const rechazado = (await ctx2.mem.store.tema(t1.id))!
    expect(rechazado.estado).toBe('rechazado')
    expect(rechazado.motivo).toBe('ES: Demasiado genérico')
    expect((await decidirTema(t1.id, 'reescribir', null, ctx2.d)).ok).toBe(true)
    const v2 = (await ctx2.mem.store.tema(t1.id))!
    expect([v2.estado, v2.version, v2.nota, v2.programadoPara]).toEqual(['aprobado', 2, 'ES: Demasiado genérico', null])
    expect(estadoPorPiezas([{ estado: 'cancelled', feedback: null, locale: 'es' }])).toMatchObject({ estado: 'fallido' })
  })

  it('fin de mesa: vetada → vetado; cerrada sin enviar → fallido con el motivo', async () => {
    const ctx = deps({ now: () => VIERNES.getTime() })
    const a = await temaAprobado(ctx, 'Primer tema de prueba del veto')
    const b = await temaAprobado(ctx, 'Segundo tema de prueba del fallo')
    const ra = await abrirRedaccion(a, ctx.d)
    const rb = await abrirRedaccion(b, ctx.d)
    if (ra.tipo !== 'abierta' || rb.tipo !== 'abierta') throw new Error('sin mesa')
    ctx.sesiones.set(ra.sessionId, { status: 'vetoed', finalReport: { reason: 'no hay datos honestos' } })
    ctx.sesiones.set(rb.sessionId, { status: 'closed', finalReport: { resultado: 'no_enviado', motivo: 'WordNext respondió 403' } })
    expect(await finalizarSesion(ra.sessionId, ctx.d)).toBe('vetado')
    expect(await finalizarSesion(rb.sessionId, ctx.d)).toBe('fallido')
    expect((await ctx.mem.store.tema(b.id))!.motivo).toBe('WordNext respondió 403')
  })

  it('fin de mesa: si el Profesor no copia el motivo, se lee del «envio» de Helsinki', async () => {
    const ctx = deps({ now: () => VIERNES.getTime() })
    const a = await temaAprobado(ctx, 'Tema cuyo envío falla en WordNext')
    const ra = await abrirRedaccion(a, ctx.d)
    if (ra.tipo !== 'abierta') throw new Error('sin mesa')
    ctx.sesiones.set(ra.sessionId, { status: 'closed', finalReport: { informe: { resumen: 'No se pudo enviar.' }, envio: { resultado: 'no_enviado', motivo: 'firma rechazada (401)' } } })
    expect(await finalizarSesion(ra.sessionId, ctx.d)).toBe('fallido')
    expect((await ctx.mem.store.tema(a.id))!.motivo).toBe('firma rechazada (401)')
  })
})

describe('informe del Profesor', () => {
  it('lee y sanea el informe; sin informe → null', () => {
    const inf = leerInforme({
      resultado: 'enviado',
      informe: { resumen: '  Explica cómo llenar mesas.  ', fuentes: ['https://ine.es/dato', 'javascript:alert(1)', 'http://inseguro.es'], objeciones: 'Faltaba la fuente del 30 %', revisar: ['La cifra del INE es de 2024', '', 'Comprueba el enlace a la carta'], devoluciones: '2' },
    })
    expect(inf).toEqual({ resumen: 'Explica cómo llenar mesas.', fuentes: ['https://ine.es/dato'], objeciones: ['Faltaba la fuente del 30 %'], revisar: ['La cifra del INE es de 2024', 'Comprueba el enlace a la carta'], devoluciones: 2 })
    expect(leerInforme({ resultado: 'enviado' })).toBeNull()
    expect(leerInforme(null)).toBeNull()
    expect(leerInforme({ informe: { resumen: '', revisar: [] } })).toBeNull()
    expect(resultadoDeCierre({ resultado: 'enviado' })).toEqual({ resultado: 'enviado', motivo: '' })
  })
})

describe('cron semanal', () => {
  it('jueves abre un plan; lunes no hace nada; el domingo manda el resumen', async () => {
    const jueves = deps({ now: () => JUEVES_10H.getTime() })
    const r = await cicloMarketing(jueves.d)
    expect(r.planes).toHaveLength(1)
    expect(jueves.abiertas[0]).toMatchObject({ kind: 'plan', payload: { destino: DESTINO, cuantos: 4 } })

    const lunes = deps({ now: () => LUNES.getTime() })
    await temaAprobado(lunes)
    expect(await cicloMarketing(lunes.d)).toMatchObject({ planes: [], redacciones: [], resumen: 'no-toca' })

    const domingo = deps({ now: () => DOMINGO_8H.getTime() })
    expect((await cicloMarketing(domingo.d)).resumen).toBe('vacio')
    const t = await temaAprobado(domingo)
    await domingo.mem.store.actualizarTema(t.id, { estado: 'redactando', programadoPara: madridAUtc(2026, 10, 6, 9) })
    await domingo.mem.store.actualizarTema(t.id, { sessionId: 's-art' })
    await enviarArticulo((await domingo.mem.store.tema(t.id))!, dossierAprobado('llenar-mesas'), domingo.d)
    await registrarTemas({ kind: 'plan', destino: DESTINO, cuantos: 4 }, 'p2', [{ categoria: 'firewall-ia', titulo: 'Qué es un firewall de IA para tu web', angulo: 'Explica el carril rápido y la revisión posterior.' }], domingo.d)
    domingo.sesiones.set('s-art', { status: 'closed', finalReport: { resultado: 'enviado', informe: { resumen: 'Ideas para llenar mesas.', revisar: ['La cifra del 30 % viene de un blog'], fuentes: ['https://ejemplo.es/estudio'] } } })
    domingo.sesiones.set('p2', { status: 'closed', finalReport: { resultado: 'registrado', informe: { resumen: 'Quedó un tema de firewall; Palermo quitó dos repetidos.', revisar: ['Encaja con la semana de Guardian'] } } })
    const res = await cicloMarketing(domingo.d)
    expect(res.resumen).toBe('enviado')
    expect(domingo.correos[0].asunto).toBe('Revisión del domingo: 1 artículo(s) y 1 tema(s)')
    expect(domingo.correos[0].texto).toContain('https://kupeku.com/panel?tab=marketing')
    expect(domingo.correos[0].texto).toContain('Profesor: Ideas para llenar mesas.')
    expect(domingo.correos[0].texto).toContain('Mira: La cifra del 30 % viene de un blog')
    expect(domingo.correos[0].html).toContain('Quedó un tema de firewall')
    expect(domingo.correos[0].html).toContain('href="https://ejemplo.es/estudio"')
  })

  it('viernes redacta UNA mesa por destino con el tema aprobado más antiguo', async () => {
    const ctx = deps({ now: () => VIERNES.getTime() })
    const a = await temaAprobado(ctx, 'El más antiguo de los aprobados')
    await temaAprobado(ctx, 'El segundo de los aprobados')
    const r = await cicloMarketing(ctx.d)
    expect(r.redacciones).toHaveLength(1)
    expect(ctx.abiertas[0].payload).toMatchObject({ temaId: a.id })
    expect((await cicloMarketing(ctx.d)).redacciones).toHaveLength(0) // una a la vez
    expect(componerResumen(await datosResumen(ctx.d))).toBeNull() // nada pendiente de revisar aún
  })
})

describe('WordNext: firma, respuesta y aviso', () => {
  const env = { WORDNEXT_URL: 'https://app.wordnext.tech', WORDNEXT_CALLBACK_SECRET: 'secreto' }
  const pieza: EnvioPieza = { tenant: DESTINO, title: 'T', slug: 't', excerpt: 'e', seoTitle: 's', seoDescription: 'd', html: '<p>x</p>', scheduledAt: null, externalRef: 'lb-mkt.x.v1.es', locale: 'es', translationKey: 'lb-mkt.x' }

  it('firma de plataforma igual a la de wp-next-starter y cuerpo con idioma y clave', async () => {
    const pedir = vi.fn(async (_url: string, o: { headers?: Record<string, string>; body?: string }) => {
      const ts = o.headers!['x-banda-timestamp']
      const esperada = `sha256=${createHmac('sha256', 'secreto').update(`${ts}.POST./api/v1/publicaciones.${o.body}`).digest('hex')}`
      expect(o.headers!['x-banda-signature']).toBe(esperada)
      expect(JSON.parse(o.body!)).toMatchObject({ locale: 'es', translationKey: 'lb-mkt.x', tenant: DESTINO })
      return { ok: true, status: 201, statusText: 'Created', text: async () => '', json: async () => ({ id: 'p1', status: 'pending', externalRef: 'lb-mkt.x.v1.es', reviewUrl: 'https://blog.wordnext.tech/admin/publicaciones/p1' }) }
    })
    const r = await enviarPieza(pieza, { env, now: () => 1_790_000_000_000, pedir: pedir as never })
    expect(r).toMatchObject({ ok: true, vista: { id: 'p1', status: 'pending' } })
    expect(pedir).toHaveBeenCalledWith('https://app.wordnext.tech/api/v1/publicaciones', expect.anything())
    expect(firmaPlataforma('k', '1', 'post', '/r', 'b')).toMatch(/^sha256=[a-f0-9]{64}$/)
  })

  it('sin configuración no envía; un 403 vuelve como error legible', async () => {
    expect(await enviarPieza(pieza, { env: {} })).toMatchObject({ ok: false })
    const pedir = async () => ({ ok: false, status: 403, statusText: 'Forbidden', text: async () => '', json: async () => ({ error: 'Esta web no acepta publicaciones de La Banda.' }) })
    expect(await enviarPieza(pieza, { env, pedir: pedir as never })).toMatchObject({ ok: false, codigo: 403, error: expect.stringContaining('no acepta') })
  })

  it('aviso entrante: firma del cuerpo exacto y forma de pieza', () => {
    const cuerpo = JSON.stringify({ evento: 'estado', id: 'p1', status: 'rejected', externalRef: 'lb-mkt.x.v1.es', feedback: 'No' })
    const firma = `sha256=${createHmac('sha256', 'secreto').update(cuerpo).digest('hex')}`
    expect(avisoFirmado(cuerpo, firma, env)).toBe(true)
    expect(avisoFirmado(cuerpo + ' ', firma, env)).toBe(false)
    expect(avisoFirmado(cuerpo, firma, {})).toBe(false)
    expect(leerVistaPieza(JSON.parse(cuerpo))).toMatchObject({ id: 'p1', status: 'rejected', feedback: 'No' })
    expect(leerVistaPieza({ id: 'p1', status: 'inventado' })).toBeNull()
  })
})

describe('búsqueda web', () => {
  it('extrae resumen y fuentes únicas de la respuesta del buscador de Anthropic', () => {
    const r = leerRespuestaBusqueda([
      { type: 'server_tool_use', id: 'x', name: 'web_search', input: {} },
      { type: 'web_search_tool_result', tool_use_id: 'x', content: [{ type: 'web_search_result', url: 'https://ine.es/a', title: 'INE', encrypted_content: '', page_age: null }, { type: 'web_search_result', url: 'https://ine.es/a', title: 'dup', encrypted_content: '', page_age: null }] },
      { type: 'text', text: '- Dato con fuente', citations: null },
    ] as never)
    expect(r).toEqual({ resumen: '- Dato con fuente', fuentes: [{ titulo: 'INE', url: 'https://ine.es/a' }] })
  })
})

describe('panel: por qué no redacta', () => {
  it('dice la causa concreta y descartar vale también para un aprobado', async () => {
    const { porQueNoRedacta } = await import('@/lib/marketing/ciclo')
    const ctx = deps({ now: () => VIERNES.getTime() })
    expect(await porQueNoRedacta(ctx.d)).toContain('no hay temas aprobados')
    const a = await temaAprobado(ctx, 'Tema aprobado para descartar luego')
    expect((await decidirTema(a.id, 'descartar', null, ctx.d)).ok).toBe(true)
    const b = await temaAprobado(ctx, 'Tema que se queda redactando')
    await abrirRedaccion(b, ctx.d)
    expect(await porQueNoRedacta(ctx.d)).toContain('ya hay una redacción en curso')
    expect(await porQueNoRedacta({ ...ctx.d, modelosOk: () => false })).toContain('faltan las claves')
  })
})

describe('temas: ángulo largo', () => {
  it('se recorta a 400 con «…» en vez de descartar el tema', () => {
    const largo = 'Explica a un pequeño negocio qué es un firewall de IA y por qué le importa. '.repeat(8)
    const r = validarTemas([{ categoria: 'firewall-ia', titulo: 'Qué es un firewall de IA para tu web', angulo: largo }], 4)
    expect(r.descartes).toEqual([])
    expect(r.temas[0].angulo.length).toBeLessThanOrEqual(400)
    expect(r.temas[0].angulo.endsWith('…')).toBe(true)
    expect(r.temas[0].angulo.startsWith('Explica a un pequeño negocio')).toBe(true)
  })
})
