/**
 * Configuración del dominio marketing (Fase 3 del marketing de WordNext).
 * Decidido con Javier (AskUserQuestion, 2026-09-28): solo artículos de blog; La Banda propone
 * temas y él los aprueba; cada artículo en ES + EN enlazados; fuentes = ficha de hechos +
 * búsqueda web (Anthropic por defecto, z.ai configurable, nunca por defecto); revisión
 * SEMANAL en domingo.
 */

export const MARKETING_DOMAIN = 'marketing'

/** Destinos por defecto: el blog de WordNext (tenant de la plataforma). */
export function destinos(env: Record<string, string | undefined> = process.env): string[] {
  const lista = (env.MARKETING_DESTINOS ?? 'blog.wordnext.tech')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))
  return lista.length ? lista : ['blog.wordnext.tech']
}

/** Artículos por semana y destino (def. 2, lo decidió Javier). Entre 1 y 5. */
export function articulosPorSemana(env: Record<string, string | undefined> = process.env): number {
  const n = Math.round(Number(env.MARKETING_ARTICULOS_SEMANA))
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 5) : 2
}

/** Temas que propone cada plan: el doble de la cadencia, para que haya dónde elegir. */
export const temasPorPlan = (env: Record<string, string | undefined> = process.env) => articulosPorSemana(env) * 2

/**
 * Modelos. Río redacta con Fable (decidido en el doc de trazabilidad); el resto de mesas con
 * Sonnet 5 y Palermo (el que aprueba) con Opus 5.5. Sin prefijo se fija a `anthropic:`: z.ai
 * solo si se pide explícitamente con `zai:…`.
 */
function conProveedor(v: string | undefined, def: string): string {
  const m = v?.trim() || def
  return m.includes(':') ? m : `anthropic:${m}`
}
export const modeloRedactor = (env: Record<string, string | undefined> = process.env) => conProveedor(env.MARKETING_MODELO_REDACTOR, 'claude-fable-5-1')
export const modeloMesa = (env: Record<string, string | undefined> = process.env) => conProveedor(env.MARKETING_MODELO_MESA, 'claude-sonnet-5')
export const modeloJuez = (env: Record<string, string | undefined> = process.env) => conProveedor(env.MARKETING_MODELO_JUEZ, 'claude-opus-5-5')

/** ¿Hay clave para los proveedores que piden los tres modelos? Sin ella no se abre mesa. */
export function modelosDisponibles(env: Record<string, string | undefined> = process.env): boolean {
  return [modeloRedactor(env), modeloMesa(env), modeloJuez(env)].every((m) => {
    const p = m.slice(0, m.indexOf(':'))
    return p === 'zai' ? Boolean(env.ZAI_API_KEY?.trim()) : Boolean(env.ANTHROPIC_API_KEY?.trim())
  })
}

export type ProveedorBusqueda = 'anthropic' | 'zai' | 'ninguna'

/** Búsqueda web: Anthropic por defecto; `MARKETING_BUSQUEDA=zai` o `ninguna` la cambian. */
export function proveedorBusqueda(env: Record<string, string | undefined> = process.env): ProveedorBusqueda {
  const v = env.MARKETING_BUSQUEDA?.trim()
  return v === 'zai' || v === 'ninguna' ? v : 'anthropic'
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
