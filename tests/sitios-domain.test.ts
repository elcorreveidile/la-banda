import { beforeEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { sitiosDomain } from '@domains/sitios/config'
import { validateDomain } from '@domains/types'
import { MAX_PAGINAS, slugificar, validarBloque, validarPaginas, validarPaginasEstaticas } from '@domains/sitios/bloques'
import { entregarSitio } from '@/lib/sitios/entrega'
import { crearSitio, esError } from '@/lib/sitios/wordnext'
import { zipDeSitio } from '@/lib/sitios/paquete'
import type { Site, SiteFile } from '@/db/sitios'
import { createEngine } from '@/engine/orchestrator'
import { createMemoryStore } from './memoryStore'

const CHAIN = ['Tokio', 'Denver', 'Estocolmo', 'Río', 'Berlín', 'Lisboa', 'Nairobi', 'Palermo', 'Helsinki', 'Profesor']

/** Estado compartido con los mocks: dossier sintético (filas de handoffs) y sitio. */
const estado = vi.hoisted(() => ({
  /** Filas de handoffs (con .payload), de la MÁS ANTIGUA a la más reciente (payloadsDeTarea invierte). */
  payloads: [] as { payload: unknown }[],
  site: null as unknown,
  entrega: null as unknown,
  errorEntrega: null as unknown,
  escritos: null as unknown,
}))

vi.mock('@/db', () => ({
  db: {
    select: () => {
      const c: Record<string, unknown> = {}
      const self = () => c
      c.from = self
      c.where = self
      c.orderBy = self
      c.limit = self
      c.then = (ok: (v: unknown) => unknown, falla: (e: unknown) => unknown) => Promise.resolve(estado.payloads).then(ok, falla)
      return c
    },
  },
}))

vi.mock('@/lib/sitios/sites', () => ({
  siteForTask: async () => estado.site,
  setEntrega: async (_id: string, e: unknown) => {
    estado.entrega = e
  },
  setErrorEntrega: async (_id: string, e: string) => {
    estado.errorEntrega = e
  },
  writeFiles: async (_id: string, files: { path: string; contenido: string }[]) => {
    estado.escritos = files
    return files.map((f) => ({ path: f.path, bytes: Buffer.byteLength(f.contenido, 'utf8') }))
  },
}))

beforeEach(() => {
  estado.payloads = []
  estado.site = null
  estado.entrega = null
  estado.errorEntrega = null
  estado.escritos = null
})

describe('dominio sitios', () => {
  it('es coherente y sigue el grafo lineal', () => {
    expect(() => validateDomain(sitiosDomain)).not.toThrow()
    expect(sitiosDomain.agents.map((a) => a.codename)).toEqual(CHAIN)
    for (let i = 0; i < CHAIN.length - 1; i++) expect(sitiosDomain.transitions[CHAIN[i]]).toEqual([CHAIN[i + 1]])
    expect(sitiosDomain.returns).toEqual({ Lisboa: ['Tokio', 'Denver', 'Estocolmo', 'Río', 'Berlín'] })
    expect(sitiosDomain.agents.filter((a) => a.canVeto).map((a) => a.codename)).toEqual(['Palermo'])
    expect(sitiosDomain.closer).toBe('Profesor')
    expect(sitiosDomain.taskKinds).toEqual(['sitio'])
  })

  it('cada agente tiene solo sus herramientas', () => {
    expect(Object.fromEntries(sitiosDomain.agents.map((a) => [a.codename, a.tools]))).toEqual({
      Tokio: ['leerBrief'],
      Denver: ['leerBrief', 'webSearch'],
      Estocolmo: ['leerBrief'],
      Río: ['leerBrief'],
      Berlín: ['leerBrief'],
      Lisboa: ['leerBrief'],
      Nairobi: [],
      Palermo: ['leerBrief'],
      Helsinki: ['entregarSitio'],
      Profesor: ['readAll'],
    })
  })

  it('los prompts fijan el campo propio, el modo/alcance y la entrega solo por código', () => {
    for (const a of sitiosDomain.agents) expect(a.systemPrompt).toMatch(/SOLO TU CAMPO NUEVO EN LA RAÍZ/i)
    for (const a of sitiosDomain.agents) expect(a.systemPrompt).toMatch(/modo/i)
    expect(sitiosDomain.agents.find((a) => a.codename === 'Río')?.systemPrompt).toMatch(/ÚNICO que produce contenido/)
    expect(sitiosDomain.agents.find((a) => a.codename === 'Río')?.systemPrompt).toMatch(/Vocabulario CERRADO/)
    expect(sitiosDomain.agents.find((a) => a.codename === 'Palermo')?.systemPrompt).toMatch(/Helsinki SIEMPRE/)
    expect(sitiosDomain.agents.find((a) => a.codename === 'Palermo')?.systemPrompt).toMatch(/NO se entrega/)
    expect(sitiosDomain.agents.find((a) => a.codename === 'Helsinki')?.systemPrompt).toMatch(/el CÓDIGO/i)
  })

  it('la cadena completa cierra con el informe del Profesor (con una devolución de Lisboa)', async () => {
    const mem = createMemoryStore()
    let lisboaCalls = 0
    const engine = createEngine(mem.store, async (agent, input) => {
      const i = CHAIN.indexOf(agent.codename)
      const payload = input.handoff.payload as Record<string, unknown>
      if (agent.codename === 'Lisboa' && lisboaCalls++ === 0) return { action: 'return', to: 'Río', payload, reason: 'el borrador no sigue la arquitectura: falta la página contacto' }
      if (agent.codename === 'Helsinki') return { action: 'pass', to: 'Profesor', payload: { ...payload, registro: { entrega: { tipo: 'estatico', paginas: 4 } } } }
      if (agent.codename === 'Profesor') return { action: 'close', payload: { resultado: 'entregada', modo: 'estatico', alcance: 'sitio', paginas: 4, entregaUrl: '/api/v1/sitios/s1/paquete', resumen: 'líneas' } }
      return { action: 'pass', to: CHAIN[i + 1], payload: { ...payload, [campoDe(agent.codename)]: 'x' } }
    })
    const { session } = await engine.openSession(sitiosDomain, { kind: 'sitio', payload: { kind: 'sitio', sitioId: 's1', titulo: 'Prueba', modo: 'estatico', alcance: 'sitio' }, createdBy: 'test' })
    const s = await engine.runSession(sitiosDomain, session.id)
    expect(s.status).toBe('closed')
    expect(s.finalReport).toMatchObject({ resultado: 'entregada', modo: 'estatico' })
    expect(mem.events.filter((e) => e.type === 'return')).toHaveLength(1)
  })
})

describe('validación de bloques (vocabulario cerrado)', () => {
  it('exige los campos obligatorios y recorta los desconocidos', () => {
    expect(validarBloque({ type: 'hero' }).ok).toBe(false)
    expect(validarBloque({ type: 'paragraph' }).ok).toBe(false)
    expect(validarBloque('texto').ok).toBe(false)
    expect(validarBloque({ type: 'carousel', titulo: 'x' }).ok).toBe(false)

    const hero = validarBloque({ type: 'hero', title: '  La Tasca ', subtitle: 'Comida granadina', hueco: 1 })
    expect(hero.ok && hero.valor).toEqual({ type: 'hero', title: 'La Tasca', subtitle: 'Comida granadina' })

    const heading = validarBloque({ type: 'heading', text: 'Carta', level: 9 })
    expect(heading.ok && heading.valor).toMatchObject({ level: 2 })

    const cta = validarBloque({ type: 'hero', title: 'T', ctaText: 'Reservar', ctaHref: '/contacto' })
    expect(cta.ok && cta.valor).toMatchObject({ ctaHref: '/contacto' })
  })

  it('las imágenes solo con URL https absoluta', () => {
    expect(validarBloque({ type: 'image', src: 'http://ejemplo.com/foto.jpg' }).ok).toBe(false)
    expect(validarBloque({ type: 'image', src: '/foto.jpg' }).ok).toBe(false)
    expect(validarBloque({ type: 'image', src: 'https://ejemplo.com/foto.jpg', alt: 'La barra' }).ok).toBe(true)
    // img inválida en blurb: se omite el campo, el bloque sigue siendo válido.
    const blurb = validarBloque({ type: 'blurb', title: 'T', desc: 'D', img: 'ftp://x' })
    expect(blurb.ok && blurb.valor).toEqual({ type: 'blurb', title: 'T', desc: 'D' })
  })

  it('slugificar quita acentos y símbolos', () => {
    expect(slugificar('Sobre Nosotros')).toBe('sobre-nosotros')
    expect(slugificar('Pingüino Ñoño')).toBe('pinguino-nono')
    expect(slugificar('  --Carta y Vinos--  ')).toBe('carta-y-vinos')
  })
})

describe('validarPaginas (wordnext)', () => {
  const pagina = (titulo: string, slug?: string, kind = 'PAGE') => ({
    title: titulo,
    ...(slug ? { slug } : {}),
    kind,
    blocks: [{ type: 'paragraph', text: 'contenido real' }],
  })

  it('descarta páginas inválidas, deduplica slugs y deja un solo HOME', () => {
    const r = validarPaginas([
      pagina('Inicio', 'inicio', 'HOME'),
      pagina('Repetida', 'inicio'), // slug repetido
      { title: 'Legal', kind: 'LEGAL', blocks: [] }, // sin bloques
      pagina('Contacto'),
      pagina('Otra portada', 'otra', 'HOME'), // segundo HOME → PAGE
    ])
    expect(r.paginas.map((p) => p.slug)).toEqual(['inicio', 'contacto', 'otra'])
    expect(r.paginas.find((p) => p.slug === 'inicio')?.kind).toBe('HOME')
    expect(r.paginas.find((p) => p.slug === 'otra')?.kind).toBe('PAGE')
    expect(r.descartes).toHaveLength(2)
  })

  it('genera el slug desde el título y respeta el tope de páginas', () => {
    const muchas = Array.from({ length: 10 }, (_, i) => pagina(`Página ${i + 1}`))
    const r = validarPaginas(muchas)
    expect(r.paginas).toHaveLength(MAX_PAGINAS)
    expect(r.paginas[0].slug).toBe('pagina-1')
  })

  it('acepta el título como lo escribe Río («titulo») y también «title»', () => {
    const r = validarPaginas([
      { titulo: 'Inicio', slug: 'inicio', kind: 'HOME', blocks: [{ type: 'paragraph', text: 'contenido real' }] },
      { titulo: 'Nuestros panes', slug: 'panes', blocks: [{ type: 'paragraph', text: 'contenido real' }] },
      { title: 'Contacto', slug: 'contacto', blocks: [{ type: 'paragraph', text: 'contenido real' }] },
    ])
    expect(r.paginas.map((p) => p.titulo)).toEqual(['Inicio', 'Nuestros panes', 'Contacto'])
    expect(r.descartes).toHaveLength(0)
  })
})

describe('validarPaginasEstaticas', () => {
  it('valida rutas, descarta duplicados y html vacío', () => {
    const r = validarPaginasEstaticas([
      { path: 'Index.html', html: '<h1>x</h1>' }, // mayúsculas
      { path: 'index.html', title: 'Inicio', html: '<h1>hola</h1>' },
      { path: 'index.html', html: '<h1>duplicada</h1>' },
      { path: 'carta.html', html: '   ' },
      { path: 'carta.html', title: 'Carta', html: '<a href="quienes.html">x</a>' },
    ])
    expect(r.paginas.map((p) => p.path)).toEqual(['index.html', 'carta.html'])
    expect(r.descartes.some((d) => d.includes('path inválido'))).toBe(true)
    expect(r.descartes.some((d) => d.includes('ruta repetida'))).toBe(true)
    expect(r.descartes.some((d) => d.includes('html vacío'))).toBe(true)
    expect(r.descartes.some((d) => d.includes('enlace interno roto a quienes.html'))).toBe(true)
    expect(r.descartes.some((d) => d.includes('falta index.html'))).toBe(false)
  })

  it('avisa si falta index.html', () => {
    const r = validarPaginasEstaticas([{ path: 'quienes.html', title: 'Quiénes', html: '<p>x</p>' }])
    expect(r.paginas).toHaveLength(1)
    expect(r.descartes.some((d) => d.includes('falta index.html'))).toBe(true)
  })

  it('acepta el título como «titulo» o «title»; si no hay, usa el path', () => {
    const r = validarPaginasEstaticas([
      { path: 'index.html', titulo: 'Inicio', html: '<h1>hola</h1>' },
      { path: 'carta.html', title: 'Carta', html: '<p>x</p>' },
      { path: 'contacto.html', html: '<p>sin título</p>' },
    ])
    expect(r.paginas.map((p) => p.titulo)).toEqual(['Inicio', 'Carta', 'contacto.html'])
  })
})

describe('entregarSitio (dossier sintético)', () => {
  const sitioEstatico = {
    id: 's1',
    titulo: 'La Tasca',
    modo: 'estatico',
    alcance: 'sitio',
    tenantId: null,
    subdominio: null,
    entrega: null,
  } as unknown as Site

  it('entrega el paquete estático: páginas, index de respaldo, CSS base y README', async () => {
    estado.site = sitioEstatico
    estado.payloads = [
      { payload: { veredictoPalermo: { aprueba: true, motivos: [] } } },
      {
        payload: {
          sitioBorrador: {
            nombre: 'La Tasca',
            paginas: [
              { path: 'index.html', titulo: 'Inicio', html: '<h1>Hola</h1>' },
              { path: 'carta.html', titulo: 'Carta', html: '<a href="quienes.html">quiénes</a>' },
            ],
            stylesCss: '',
          },
        },
      },
    ]
    const r = await entregarSitio('t1')
    expect(r.error).toBeUndefined()
    expect(r.entrega?.tipo).toBe('estatico')
    expect(r.entrega?.descargaUrl).toBe('/api/v1/sitios/s1/paquete')
    expect(r.entrega?.descartados?.some((d) => d.includes('enlace interno roto'))).toBe(true)
    const paths = (estado.escritos as { path: string; contenido: string }[]).map((f) => f.path)
    expect(paths).toEqual(['index.html', 'carta.html', 'styles.css', 'README.md'])
    const escritos = estado.escritos as { path: string; contenido: string }[]
    expect(escritos.find((f) => f.path === 'index.html')?.contenido).toContain('<nav>')
    expect(escritos.find((f) => f.path === 'index.html')?.contenido).toContain('carta.html')
    expect(escritos.find((f) => f.path === 'styles.css')?.contenido).toContain('Hoja base')
    expect(escritos.find((f) => f.path === 'README.md')?.contenido).toContain('Netlify')
    expect(estado.entrega).toBe(r.entrega)
    expect(estado.errorEntrega).toBeNull()
  })

  it('genera index.html desde la primera página si falta', async () => {
    estado.site = sitioEstatico
    estado.payloads = [
      { payload: { veredictoPalermo: { aprueba: true, motivos: [] } } },
      { payload: { sitioBorrador: { paginas: [{ path: 'quienes.html', titulo: 'Quiénes', html: '<p>x</p>' }] } } },
    ]
    const r = await entregarSitio('t1')
    expect(r.error).toBeUndefined()
    const paths = (estado.escritos as { path: string; contenido: string }[]).map((f) => f.path)
    expect(paths).toContain('index.html')
    expect(paths).toContain('quienes.html')
  })

  it('no entrega sin la aprobación de Palermo (guarda en código)', async () => {
    estado.site = sitioEstatico
    estado.payloads = [{ payload: { sitioBorrador: { paginas: [{ path: 'index.html', titulo: 'Inicio', html: '<p>x</p>' }] } } }]
    const r = await entregarSitio('t1')
    expect(r.sinAprobacion).toBe(true)
    expect(r.error).toContain('sin veredicto de Palermo')
    expect(estado.entrega).toBeNull()
    expect(estado.errorEntrega).toContain('sin veredicto')
  })

  it('es idempotente: con entrega registrada devuelve la misma sin re-entregar', async () => {
    const previa = { tipo: 'estatico' as const, paginas: 2 }
    estado.site = { ...sitioEstatico, entrega: previa }
    const r = await entregarSitio('t1')
    expect(r.entrega).toEqual(previa)
    expect(estado.escritos).toBeNull()
    expect(estado.entrega).toBeNull()
  })

  it('wordnext sin envs: error controlado (demo-safe) y estado error_entrega', async () => {
    estado.site = { ...sitioEstatico, modo: 'wordnext' }
    estado.payloads = [
      { payload: { veredictoPalermo: { aprueba: true, motivos: [] } } },
      { payload: { sitioBorrador: { nombre: 'La Tasca', paginas: [{ title: 'Inicio', slug: 'inicio', kind: 'HOME', blocks: [{ type: 'paragraph', text: 'x' }] }] } } },
    ]
    const { WORDNEXT_URL, WORDNEXT_API_KEY } = process.env
    delete process.env.WORDNEXT_URL
    delete process.env.WORDNEXT_API_KEY
    try {
      const r = await entregarSitio('t1')
      expect(r.error).toContain('WordNext no configurado')
      expect(estado.entrega).toBeNull()
      expect(estado.errorEntrega).toContain('no configurado')
    } finally {
      if (WORDNEXT_URL) process.env.WORDNEXT_URL = WORDNEXT_URL
      if (WORDNEXT_API_KEY) process.env.WORDNEXT_API_KEY = WORDNEXT_API_KEY
    }
  })
})

describe('cliente wordnext', () => {
  it('sin envs devuelve error controlado, nunca lanza', async () => {
    const { WORDNEXT_URL, WORDNEXT_API_KEY } = process.env
    delete process.env.WORDNEXT_URL
    delete process.env.WORDNEXT_API_KEY
    try {
      const r = await crearSitio({ nombre: 'X', pages: [], bandaSiteId: 's1' })
      expect(esError(r)).toBe(true)
    } finally {
      if (WORDNEXT_URL) process.env.WORDNEXT_URL = WORDNEXT_URL
      if (WORDNEXT_API_KEY) process.env.WORDNEXT_API_KEY = WORDNEXT_API_KEY
    }
  })
})

describe('paquete zip', () => {
  it('empaqueta los ficheros del sitio en memoria', async () => {
    const site = { titulo: 'La Tasca de Granada' } as Site
    const files = [
      { path: 'index.html', contenido: '<h1>hola</h1>' },
      { path: 'styles.css', contenido: 'body{}' },
    ] as unknown as SiteFile[]
    const { bytes, nombre } = await zipDeSitio(site, files)
    expect(nombre).toBe('la-tasca-de-granada.zip')
    const zip = await JSZip.loadAsync(bytes)
    expect(await zip.file('index.html')!.async('string')).toBe('<h1>hola</h1>')
    expect(await zip.file('styles.css')!.async('string')).toBe('body{}')
    expect(zip.file('no-esta.html')).toBeNull()
  })
})

function campoDe(codename: string): string {
  const campos: Record<string, string> = {
    Tokio: 'encargo',
    Denver: 'referencias',
    Estocolmo: 'arquitectura',
    Río: 'sitioBorrador',
    Berlín: 'verificacion',
    Lisboa: 'coherencia',
    Nairobi: 'resumenEntrega',
    Palermo: 'veredictoPalermo',
  }
  return campos[codename] ?? 'extra'
}
