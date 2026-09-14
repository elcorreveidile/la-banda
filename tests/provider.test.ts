import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetProviders, getProvider, providerFor, PROVIDER_TIMEOUT_MS } from '@/engine/provider'

describe('proveedor por agente', () => {
  beforeEach(() => {
    _resetProviders()
    process.env.ZAI_API_KEY = 'z'
    process.env.ANTHROPIC_API_KEY = 'a'
    delete process.env.ZAI_MODEL
    delete process.env.ANTHROPIC_MODEL
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    _resetProviders()
    delete process.env.ZAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    vi.restoreAllMocks()
  })

  it('predeterminado: z.ai si hay clave, con su modelo', () => {
    expect(getProvider().name).toBe('zai')
    expect(providerFor(undefined)).toMatchObject({ provider: { name: 'zai' }, model: 'glm-5.3' })
    expect(providerFor('glm-4.7')).toMatchObject({ provider: { name: 'zai' }, model: 'glm-4.7' })
  })

  it('prefijo anthropic: → cliente de Anthropic con ese modelo', () => {
    const r = providerFor('anthropic:claude-sonnet-5')
    expect(r.provider.name).toBe('anthropic')
    expect(r.provider.native).toBe(true)
    expect(r.model).toBe('claude-sonnet-5')
    expect(providerFor('anthropic:')).toMatchObject({ provider: { name: 'anthropic' }, model: 'claude-opus-5' })
  })

  it('sin clave del proveedor pedido → predeterminado y aviso', () => {
    delete process.env.ANTHROPIC_API_KEY
    const r = providerFor('anthropic:claude-sonnet-5')
    expect(r.provider.name).toBe('zai')
    expect(r.model).toBe('glm-5.3')
    expect(console.warn).toHaveBeenCalled()
  })

  it('sin ninguna clave lanza', () => {
    delete process.env.ZAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    expect(() => getProvider()).toThrow(/Falta/)
  })

  it('tope por llamada de 180 s (100 s de herramientas + 180 < 300 del tick)', () => {
    expect(PROVIDER_TIMEOUT_MS).toBe(180_000)
  })
})
