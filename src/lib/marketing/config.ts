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
export const DESTINOS_POR_DEFECTO =
  'blog.wordnext.tech,restaurante.wordnext.tech,laclasedigital.wordnext.tech,servicios.wordnext.tech,tienda.wordnext.tech,banda.wordnext.tech,javier.wordnext.tech'
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
  /** Idiomas en que se publica (sin valor: español e inglés enlazados). Una web solo en español: ['es']. */
  idiomas?: Idioma[]
  /** Datos propios del destino (precios, productos) que un artículo puede citar; Palermo los comprueba como la ficha. */
  hechos?: string[]
}

export type Idioma = 'es' | 'en'
/** Idiomas en que se publica un destino (por defecto, los dos). */
export const idiomasDestino = (destino: string): Idioma[] => perfilDestino(destino).idiomas ?? ['es', 'en']

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
  if (destino === 'tienda.wordnext.tech') {
    return {
      nombre: 'Blog de «La Despensa Verde», tienda ecológica de EJEMPLO hecha con WordNext (escaparate de tienda)',
      publico: 'dueños de tiendas pequeñas y comercios de proximidad de España que venden o quieren vender por internet (alimentación, productos locales y ecológicos, regalo)',
      categorias: ['comercio'],
      porSemana: 1,
      cierre: {
        es: 'Cierra con una línea que recuerde que este blog es de una tienda de ejemplo hecha con WordNext y enlace a https://app.wordnext.tech/crear?tpl=tienda («crea la web de tu tienda gratis»), sin exagerar.',
        en: 'End with one line reminding that this blog belongs to an example shop built with WordNext, linking to https://app.wordnext.tech/crear?tpl=tienda&lang=en, without overselling.',
      },
      notas: [
        'La Despensa Verde NO existe: nunca la presentes como una tienda real ni cuentes clientes, ventas, cifras o pedidos suyos. Si la usas de ejemplo, di que es un ejemplo.',
        'Escribe para el DUEÑO de la tienda (fichas de producto, fotos, precios y extras, envíos y recogida, pagos, devoluciones, reseñas, temporada), no para el comprador: nada de recetas ni consejos de salud o nutrición.',
        'WordNext sale solo en el cierre o donde de verdad resuelve algo (productos con su página, extras que suman al precio, cobro con tarjeta en la cuenta de Stripe del comercio).',
        'Enlaces internos: solo a URLs de leerBlog de este destino o de la ficha de hechos.',
      ],
    }
  }
  if (destino === 'banda.wordnext.tech') {
    return {
      nombre: 'Blog de La Banda: agentes de IA a medida para negocios (banda.wordnext.tech)',
      publico: 'dueños y directivos de pymes, despachos y equipos de España con procesos repetitivos de revisar, redactar, clasificar o decidir (documentos, informes, contenidos, atención)',
      categorias: ['agentes-ia'],
      porSemana: 1,
      idiomas: ['es'],
      cierre: {
        es: 'Cierra con una línea que invite a reservar la videollamada gratis de 30 minutos (/reservar-llamada) o a ver los precios (/precios), sin exagerar.',
        en: '',
      },
      notas: [
        'Escribe para quien tiene el proceso (qué tarea se puede delegar a un equipo de agentes, cómo se controla, cuánto cuesta, qué riesgos tiene), no para técnicos: nada de jerga sin explicar.',
        'NUNCA inventes clientes, casos, ahorros ni porcentajes («redujimos un 70 %…»). Los únicos casos reales son las tres bandas de los hechos del perfil; si pones otro ejemplo, di que es un ejemplo.',
        'Sin promesas de sustituir personas: la banda propone y una persona aprueba (veto y revisión humana).',
        'Enlaces internos: solo a URLs de leerBlog de este destino, /precios, /reservar-llamada, /contacto o de la ficha de hechos.',
      ],
      hechos: [
        'La Banda monta a medida un equipo de agentes de IA con papeles fijos que se pasan el trabajo por traspasos trazables, con veto y revisión humana antes de publicar o decidir nada.',
        'Precios orientativos: Piloto desde 600 € (pago único: análisis del proceso, una banda configurada, un primer lote real e informe de trazabilidad); Operación desde 150 € al mes por banda (ejecución programada, panel, ajustes y soporte, coste de IA incluido hasta un volumen); A medida con presupuesto (varias bandas, integración por API, SLA, formación).',
        'Primera videollamada de 30 minutos gratis y sin compromiso, con reserva en /reservar-llamada.',
        'Trabaja con varios modelos de IA (Claude, GLM y otros) y cambia de uno a otro si uno falla o se encarece.',
        'Bandas en producción: Corpus ELE (muestras de español graduadas por nivel para estudiantes, revisadas antes de publicarse), una mesa de trading SIMULADA (sin dinero real) y la redacción de la revista Olvidos de Granada; además, el firewall de IA de WordNext y el blog de WordNext.',
      ],
    }
  }
  if (destino === 'javier.wordnext.tech' || destino === 'www.jblainez.es' || destino === 'jblainez.es') {
    return {
      nombre: 'Blog de Javier Benítez Láinez, escritor y profesor (jblainez.es)',
      publico: 'personas que escriben o quieren escribir poesía por su cuenta: principiantes y aficionados de habla hispana',
      categorias: ['escritura'],
      porSemana: 1,
      idiomas: ['es'],
      cierre: {
        es: 'Cierra con una línea que invite al «Taller de poesía: cómo respira un poema» (/cursos-de-poesia), sin exagerar.',
        en: '',
      },
      notas: [
        'Temas de oficio: el verso y su corte, la métrica, las estrofas, la imagen y el símbolo, el tono, revisar un poema, leer poesía, publicar en revistas y premios. Útil para quien escribe, con ejercicios concretos.',
        'Escribe en la voz de un profesor de escritura, pero NUNCA inventes anécdotas, alumnos ni resultados de Javier, ni publiques poemas suyos.',
        'Derechos de autor: poemas enteros solo de autores en dominio público en España (fallecidos hace más de 80 años: Machado, Lorca, Bécquer, Miguel Hernández, los clásicos); de los demás, como mucho 4 versos con autor y título. Nunca inventes versos atribuidos a un autor.',
        'Enlaces internos: solo a URLs de leerBlog de este destino, /cursos-de-poesia o de la ficha de hechos.',
      ],
      hechos: [
        'Taller de poesía «Cómo respira un poema», de Javier Benítez Láinez: seis sesiones (cómo respira un poema, la sílaba, estrofas y formas, imagen y símbolo, tono y voz, taller de revisión y cierre).',
        'A tu ritmo: 49 €, pago único; lecturas comentadas, ejercicios con entrega y comentario, tarea final corregida por Javier y certificado; la primera lección es gratis.',
        'En directo: 149 € (el curso a tu ritmo + 6 sesiones por Zoom en grupo reducido); las fechas de la próxima edición se comunican por correo.',
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
    // Las categorías de un solo destino (agentes de IA, escritura) no van al blog de WordNext.
    categorias: CATEGORIAS.map((c) => c.id).filter((id) => !CATEGORIAS_PROPIAS.has(id)),
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
  { id: 'agentes-ia', es: 'Agentes de IA para negocios (La Banda)', en: 'AI agents for business (La Banda)' },
  { id: 'escritura', es: 'Escritura y poesía', en: 'Writing & poetry' },
] as const

/** Categorías de un solo destino (La Banda y jblainez.es): el blog de WordNext no las propone. */
const CATEGORIAS_PROPIAS = new Set<string>(['agentes-ia', 'escritura'])

export const IDS_CATEGORIA = new Set<string>(CATEGORIAS.map((c) => c.id))

/** Sesión de marketing colgada: se abandona pasado este tiempo (la bomba ya reintenta pasos). */
export const MARKETING_SESION_MAX_MS = 3 * 60 * 60 * 1000
/** Retención de la traza de sesiones terminadas (sin datos de personas; 90 días). */
export const MARKETING_TRAZA_MS = 90 * 24 * 60 * 60 * 1000
