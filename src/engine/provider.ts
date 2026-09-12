import Anthropic from '@anthropic-ai/sdk'

/**
 * Proveedor de modelo para los agentes (mismo patrón que wp-next-starter):
 * z.ai primero (endpoint compatible con el SDK de Anthropic, modelos GLM) y,
 * si no hay clave, la API de Anthropic. Los parámetros exclusivos de Anthropic
 * (`output_config`) solo se envían cuando el proveedor es Anthropic.
 */
export interface Provider {
  name: 'zai' | 'anthropic'
  client: Anthropic
  model: string
  /** Acepta `output_config.effort` y demás parámetros propios de Anthropic. */
  native: boolean
}

let cached: Provider | null = null

export function getProvider(): Provider {
  if (cached) return cached
  const zai = process.env.ZAI_API_KEY?.trim()
  const anthropic = process.env.ANTHROPIC_API_KEY?.trim()
  if (zai) {
    cached = {
      name: 'zai',
      client: new Anthropic({ apiKey: zai, baseURL: process.env.ZAI_BASE_URL?.trim() || 'https://api.z.ai/api/anthropic', maxRetries: 1, timeout: 120_000 }),
      model: process.env.ZAI_MODEL?.trim() || 'glm-5.3',
      native: false,
    }
  } else if (anthropic) {
    cached = {
      name: 'anthropic',
      client: new Anthropic({ apiKey: anthropic, maxRetries: 1, timeout: 120_000 }),
      model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5',
      native: true,
    }
  } else {
    throw new Error('Falta ZAI_API_KEY o ANTHROPIC_API_KEY')
  }
  return cached
}

export function hasProvider(): boolean {
  return Boolean(process.env.ZAI_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim())
}
