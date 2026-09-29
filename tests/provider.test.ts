import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetProviders, anthropicActivo, getProvider, hayClavePara, modeloEfectivo, providerFor, PROVIDER_TIMEOUT_MS } from '@/engine/provider'

describe('proveedor por agente', () => {
  beforeEach(() => {
    _resetProviders()
    process.env.ZAI_API_KEY = 'z'
    process.env.ANTHROPIC_API_KEY = 'a'
    delete process.env.ZAI_MODEL
    delete process.env.ANTHROPIC_MODEL
    delete process.env.DEFAULT_PROVIDER
    process.env.ANTHROPIC_ACTIVO = '1'
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    _resetProviders()
    delete process.env.ZAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_ACTIVO
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

  it('DEFAULT_PROVIDER fuerza el predeterminado si tiene clave; si no, avisa y sigue', () => {
    process.env.DEFAULT_PROVIDER = 'anthropic'
    expect(getProvider().name).toBe('anthropic')
    expect(providerFor(undefined)).toMatchObject({ provider: { name: 'anthropic' }, model: 'claude-opus-5' })
    _resetProviders()
    delete process.env.ANTHROPIC_API_KEY
    expect(getProvider().name).toBe('zai')
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

  it('Anthropic apagado (sin ANTHROPIC_ACTIVO=1): su clave se ignora y todo va a z.ai', () => {
    delete process.env.ANTHROPIC_ACTIVO
    _resetProviders()
    expect(anthropicActivo()).toBe(false)
    process.env.DEFAULT_PROVIDER = 'anthropic'
    expect(getProvider().name).toBe('zai')
    expect(providerFor('anthropic:claude-sonnet-5')).toMatchObject({ provider: { name: 'zai' }, model: 'glm-5.3' })
    expect(providerFor('claude-fable-5-1')).toMatchObject({ provider: { name: 'zai' }, model: 'glm-5.3' })
    expect(modeloEfectivo('anthropic:claude-opus-5-5', {})).toBe('zai:glm-5.3')
    expect(modeloEfectivo('zai:glm-4.7', {})).toBe('zai:glm-4.7')
    expect(modeloEfectivo('anthropic:claude-opus-5-5', { ANTHROPIC_ACTIVO: '1' })).toBe('anthropic:claude-opus-5-5')
    expect(hayClavePara('anthropic:claude-opus-5-5', { ANTHROPIC_API_KEY: 'a' })).toBe(false)
    expect(hayClavePara('anthropic:claude-opus-5-5', { ZAI_API_KEY: 'z' })).toBe(true)
    delete process.env.ZAI_API_KEY
    _resetProviders()
    expect(() => getProvider()).toThrow(/Falta/)
  })
})
