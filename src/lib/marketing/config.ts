/**
 * Configuración del dominio marketing (Fase 3 del marketing de WordNext).
 * Decidido con Javier (AskUserQuestion, 2026-09-28): solo artículos de blog; La Banda propone
 * temas y él los aprueba; cada artículo en ES + EN enlazados; fuentes = ficha de hechos +
 * búsqueda web (Anthropic por defecto, z.ai configurable, nunca por defecto); revisión
 * SEMANAL en domingo.
 */

import { anthropicActivo, hayClavePara, modeloEfectivo } from '@/engine/provider'

export const MARKETING_DOMAIN = 'marketing'

/** Destinos por defecto: el blog de WordNext y los escaparates de la Fase 4 (restaurante, academia y fisioterapia). */
export const DESTINOS_POR_DEFECTO = 'blog.wordnext.tech,restaurante.wordnext.tech,laclasedigital.wordnext.tech,servicios.wordnext.tech'
export function destinos(env: Record<string, string | undefined> = process.env): string[] {
  const lista = (env.MARKETING_DESTINOS ?? DESTINOS_POR_DEFECTO)
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))
  return lista.length ? lista : ['blog.wordnext.tech']
}

/**
 * Artículos por semana. Con destino, manda el ritmo de su perfil (el escaparate de restauración
 * arranca con 1); si no, `MARKETING_ARTICULOS_SEMANA` (def. 2, lo decidió Javier). Entre 1 y 5.
 */
export function articulosPorSemana(env: Record<string, string | undefined> = process.env, destino?: string): number {
  const propio = destino ? perfilDestino(destino).porSemana : undefined
  if (propio) return propio
  const n = Math.round(Number(env.MARKETING_ARTICULOS_SEMANA))
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 5) : 2
}

/** Temas que propone cada plan: el doble de la cadencia, para que haya dónde elegir. */
export const temasPorPlan = (env: Record<string, string | undefined> = process.env, destino?: string) => articulosPorSemana(env, destino) * 2

/**
 * Perfil de cada destino (Fase 4): a quién escribe, de qué categorías, a qué ritmo y cómo cierra.
 * Lo leen los agentes en leerEncargo y el código al validar temas. Un destino sin perfil usa el
 * del blog de WordNext.
 */
export interface PerfilDestino {
  nombre: string
  publico: string
  /** Categorías permitidas (ids de CATEGORIAS). */
  categorias: string[]
  /** Artículos por semana propios (si no, el general). */
  porSemana?: number
  /** Cómo cierra cada artículo, en español y en inglés. */
  cierre: { es: string; en: string }
  /** Reglas propias del destino. */
  notas: string[]
}

export function perfilDestino(destino: string): PerfilDestino {
  if (destino === 'restaurante.wordnext.tech') {
    return {
      nombre: 'Blog de «Taberna del Olivar», restaurante de EJEMPLO hecho con WordNext (escaparate de restauración)',
      publico: 'dueños y gerentes de restaurantes, bares y cafeterías de España',
      categorias: ['restauracion'],
      porSemana: 1,
      cierre: {
        es: 'Cierra con una línea que recuerde que este blog es de un restaurante de ejemplo hecho con WordNext y enlace a https://app.wordnext.tech/crear?tpl=restaurante («crea la web de tu restaurante gratis»), sin exagerar.',
        en: 'End with one line reminding that this blog belongs to an example restaurant built with WordNext, linking to https://app.wordnext.tech/crear?tpl=restaurante&lang=en, without overselling.',
      },
      notas: [
        'Taberna del Olivar NO existe: nunca la presentes como un restaurante real ni cuentes experiencias, cifras o clientes suyos («en nuestra taberna conseguimos…»). Si la usas de ejemplo, di que es un ejemplo.',
        'Útil para el dueño de un restaurante (reservas, carta online, reseñas, temporada, equipo, costes); WordNext sale solo en el cierre o donde de verdad resuelve algo.',
        'Enlaces internos: solo a URLs de leerBlog de este destino o de la ficha de hechos.',
      ],
    }
  }
  if (destino === 'servicios.wordnext.tech') {
    return {
      nombre: 'Blog de «Fisioterapia Alameda», clínica de fisioterapia de EJEMPLO hecha con WordNext (escaparate de servicios)',
      publico: 'fisioterapeutas y dueños de consultas y centros de salud y bienestar de España (fisioterapia, osteopatía, podología, nutrición, psicología)',
      categorias: ['salud'],
      porSemana: 1,
      cierre: {
        es: 'Cierra con una línea que recuerde que este blog es de una clínica de ejemplo hecha con WordNext y enlace a https://app.wordnext.tech/crear?tpl=profesional («crea la web de tu consulta gratis»), sin exagerar.',
        en: 'End with one line reminding that this blog belongs to an example clinic built with WordNext, linking to https://app.wordnext.tech/crear?tpl=profesional&lang=en, without overselling.',
      },
      notas: [
        'Fisioterapia Alameda NO existe: nunca la presentes como una clínica real ni cuentes pacientes, casos, cifras o resultados suyos. Si la usas de ejemplo, di que es un ejemplo.',
        'Escribe para el PROFESIONAL que lleva la consulta (citas online, recordatorios, cancelaciones, reseñas, explicar sus servicios, videoconsulta), NO para pacientes: nada de consejos médicos, diagnósticos ni promesas de curación.',
        'WordNext sale solo en el cierre o donde de verdad resuelve algo (reservas con agenda, valoración por videollamada, formulario de contacto).',
        'Enlaces internos: solo a URLs de leerBlog de este destino o de la ficha de hechos.',
      ],
    }
  }
  if (destino === 'laclasedigital.wordnext.tech' || destino === 'academia.laclasedigital.com') {
    return {
      nombre: 'Blog de la academia de La Clase Digital (Javier Benítez Láinez), hecha con WordNext',
      publico: 'profesores de idiomas (sobre todo de español como lengua extranjera) y formadores que dan clase por su cuenta o en academias pequeñas',
      categorias: ['docencia'],
      porSemana: 1,
      cierre: {
        es: 'Cierra con una línea que invite al curso «Monta y vende tu web» (49 €, en /curso de este blog) o a suscribirse, sin exagerar.',
        en: 'End with one line inviting readers to the course «Monta y vende tu web» (€49, taught in Spanish, at /en-course on this site), without overselling.',
      },
      notas: [
        'Escribe como la academia de un profesor real (Javier, profesor de ELE en Granada), pero NUNCA inventes anécdotas, alumnos, cifras ni resultados suyos («mis alumnos aprobaron…»): si pones un ejemplo, di que es un ejemplo.',
        'Temas: la web y la venta online de un profe (web de clases, curso online, actividades autocorregidas, cobrar, lista de correo, blog) y la IA en clase con criterio. Útil para el profe primero; WordNext solo donde de verdad resuelve algo.',
        'El curso «Monta y vende tu web (para profes)»: 49 €, pago único, 5 módulos, 15 lecciones, 5 actividades autocorregidas, tarea final y certificado; se imparte en español.',
        'Enlaces internos: solo a URLs de leerBlog de este destino, a /curso (o /en-course en inglés) o de la ficha de hechos.',
      ],
    }
  }
  return {
    nombre: 'El Quirófano, el blog de WordNext',
    publico: 'dueños de pequeños negocios que tienen o necesitan web',
    categorias: CATEGORIAS.map((c) => c.id),
    cierre: {
      es: 'Termina con una sección breve de preguntas frecuentes y un cierre que mencione WordNext con un enlace de la ficha, sin exagerar.',
      en: 'End with a short FAQ section and a closing line mentioning WordNext with a link from the facts sheet, without overselling.',
    },
    notas: ['Incluye un tema de firewall de IA / WordNext Guardian cada semana que puedas (lo pidió Javier).'],
  }
}

/**
 * Modelos. Río redacta con Fable (decidido en el doc de trazabilidad); el resto de mesas con
 * Sonnet 5 y Palermo (el que aprueba) con Opus 5.5. Sin prefijo se fija a `anthropic:`: z.ai
 * solo si se pide explícitamente con `zai:…`.
 */
function conProveedor(v: string | undefined, def: string, env: Record<string, string | undefined>): string {
  const m = v?.trim() || def
  return modeloEfectivo(m.includes(':') ? m : `anthropic:${m}`, env)
}
export const modeloRedactor = (env: Record<string, string | undefined> = process.env) => conProveedor(env.MARKETING_MODELO_REDACTOR, 'claude-fable-5-1', env)
export const modeloMesa = (env: Record<string, string | undefined> = process.env) => conProveedor(env.MARKETING_MODELO_MESA, 'claude-sonnet-5', env)
export const modeloJuez = (env: Record<string, string | undefined> = process.env) => conProveedor(env.MARKETING_MODELO_JUEZ, 'claude-opus-5-5', env)

/** ¿Hay clave para los proveedores que piden los tres modelos? Sin ella no se abre mesa. */
export function modelosDisponibles(env: Record<string, string | undefined> = process.env): boolean {
  return [modeloRedactor(env), modeloMesa(env), modeloJuez(env)].every((m) => hayClavePara(m, env))
}

export type ProveedorBusqueda = 'anthropic' | 'zai' | 'ninguna'

/**
 * Búsqueda web: Anthropic por defecto si está activo (ANTHROPIC_ACTIVO=1); si no, z.ai.
 * `MARKETING_BUSQUEDA=zai` o `ninguna` la cambian; `anthropic` solo vale con Anthropic activo.
 */
export function proveedorBusqueda(env: Record<string, string | undefined> = process.env): ProveedorBusqueda {
  const v = env.MARKETING_BUSQUEDA?.trim()
  if (v === 'zai' || v === 'ninguna') return v
  return anthropicActivo(env) ? 'anthropic' : 'zai'
}

/** Buzón que recibe el resumen del domingo. javier@blablaele.com NO existe: nunca usarlo. */
export function revisorEmail(env: Record<string, string | undefined> = process.env): string {
  const v = env.MARKETING_REVISOR_EMAIL?.trim().toLowerCase()
  return v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v !== 'javier@blablaele.com' ? v : 'informa@blablaele.com'
}

/** Categorías del escaparate (doc de trazabilidad) + el firewall de IA que pidió Javier. */
export const CATEGORIAS = [
  { id: 'restauracion', es: 'Restauración y hostelería', en: 'Restaurants & hospitality' },
  { id: 'docencia', es: 'Docencia y cursos online', en: 'Teaching & online courses' },
  { id: 'coaching', es: 'Coaching y marca personal', en: 'Coaching & personal brand' },
  { id: 'salud', es: 'Salud y bienestar', en: 'Health & wellness' },
  { id: 'belleza', es: 'Belleza y estética', en: 'Beauty & personal care' },
  { id: 'servicios', es: 'Servicios profesionales', en: 'Professional services' },
  { id: 'comercio', es: 'Comercio y tienda online', en: 'Retail & online shop' },
  { id: 'turismo', es: 'Turismo y alojamiento', en: 'Tourism & stays' },
  { id: 'firewall-ia', es: 'Firewall de IA y web agéntica (WordNext Guardian)', en: 'AI firewall & agentic web (WordNext Guardian)' },
  { id: 'migracion', es: 'Migrar de WordPress a Next.js', en: 'Migrating from WordPress to Next.js' },
] as const

export const IDS_CATEGORIA = new Set<string>(CATEGORIAS.map((c) => c.id))

/** Sesión de marketing colgada: se abandona pasado este tiempo (la bomba ya reintenta pasos). */
export const MARKETING_SESION_MAX_MS = 3 * 60 * 60 * 1000
/** Retención de la traza de sesiones terminadas (sin datos de personas; 90 días). */
export const MARKETING_TRAZA_MS = 90 * 24 * 60 * 60 * 1000
