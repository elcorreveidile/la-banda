import Anthropic from '@anthropic-ai/sdk'

/**
 * Proveedor de modelo para los agentes (mismo patrón que wp-next-starter):
 * z.ai primero (endpoint compatible con el SDK de Anthropic, modelos GLM) y,
 * si no hay clave, la API de Anthropic. Los parámetros exclusivos de Anthropic
 * (`output_config`) solo se envían cuando el proveedor es Anthropic.
 *
 * Un agente puede pedir otro proveedor con `model: 'anthropic:claude-sonnet-5'` o
 * `'zai:glm-5.3'` (`providerFor`). Si falta la clave de ese proveedor, se usa el
 * predeterminado con su modelo por defecto y se avisa por consola.
 *
 * Tiempos: una sola llamada puede tardar (Río redactando un B2 pasaba de 120 s), así que
 * el tope por llamada es 180 s y el SDK NO reintenta (maxRetries 0): el reintento lo hace
 * el motor (la bomba relanza el traspaso) sin doblar el tiempo dentro de un mismo tick.
 * Presupuesto del tick: AGENT_BUDGET_MS (100 s de herramientas) + 180 s < 300 s.
 */
export interface Provider {
  name: 'zai' | 'anthropic'
  client: Anthropic
  model: string
  /** Acepta `output_config.effort` y demás parámetros propios de Anthropic. */
  native: boolean
}

export const PROVIDER_TIMEOUT_MS = 180_000

const cache: Partial<Record<Provider['name'], Provider>> = {}

function construir(name: Provider['name']): Provider | null {
  if (cache[name]) return cache[name]!
  if (name === 'zai') {
    const key = process.env.ZAI_API_KEY?.trim()
    if (!key) return null
    cache.zai = {
      name: 'zai',
      client: new Anthropic({ apiKey: key, baseURL: process.env.ZAI_BASE_URL?.trim() || 'https://api.z.ai/api/anthropic', maxRetries: 0, timeout: PROVIDER_TIMEOUT_MS }),
      model: process.env.ZAI_MODEL?.trim() || 'glm-5.3',
      native: false,
    }
    return cache.zai
  }
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return null
  cache.anthropic = {
    name: 'anthropic',
    client: new Anthropic({ apiKey: key, maxRetries: 0, timeout: PROVIDER_TIMEOUT_MS }),
    model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5',
    native: true,
  }
  return cache.anthropic
}

/** Proveedor predeterminado: z.ai si hay clave; si no, Anthropic. */
export function getProvider(): Provider {
  const p = construir('zai') ?? construir('anthropic')
  if (!p) throw new Error('Falta ZAI_API_KEY o ANTHROPIC_API_KEY')
  return p
}

/**
 * Proveedor y modelo para un agente según su `model` opcional:
 * - `undefined` → predeterminado con su modelo por defecto;
 * - `'glm-5.3'` → predeterminado con ese modelo;
 * - `'anthropic:claude-sonnet-5'` / `'zai:glm-5.3'` → ese proveedor (si hay clave) con ese modelo.
 */
export function providerFor(model?: string): { provider: Provider; model: string } {
  const m = model?.trim()
  if (!m) {
    const provider = getProvider()
    return { provider, model: provider.model }
  }
  const dos = m.indexOf(':')
  const prefijo = dos > 0 ? m.slice(0, dos) : null
  if (prefijo === 'anthropic' || prefijo === 'zai') {
    const nombre = m.slice(dos + 1).trim()
    const p = construir(prefijo)
    if (p) return { provider: p, model: nombre || p.model }
    console.warn(`[la-banda] proveedor ${prefijo} sin clave; se usa el predeterminado`)
    const provider = getProvider()
    return { provider, model: provider.model }
  }
  return { provider: getProvider(), model: m }
}

/** Solo para tests: vacía la caché de clientes. */
export function _resetProviders(): void {
  delete cache.zai
  delete cache.anthropic
}

export function hasProvider(): boolean {
  return Boolean(process.env.ZAI_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim())
}
