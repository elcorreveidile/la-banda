import { describe, expect, it } from 'vitest'
import { parsePerfil, textoPerfil, PERFIL_DEF } from '@/lib/trading/perfil'

describe('parsePerfil', () => {
  it('normaliza valores válidos', () => {
    expect(parsePerfil('activo', 'alta')).toEqual({ horizonte: 'activo', tolerancia: 'alta' })
    expect(parsePerfil('largo', 'baja')).toEqual({ horizonte: 'largo', tolerancia: 'baja' })
  })

  it('cae a valores por defecto ante basura o ausencia', () => {
    expect(parsePerfil(undefined, undefined)).toEqual(PERFIL_DEF)
    expect(parsePerfil('corto', 'extrema')).toEqual({ horizonte: 'largo', tolerancia: 'media' })
    expect(parsePerfil(42, {})).toEqual(PERFIL_DEF)
  })
})

describe('textoPerfil', () => {
  it('menciona horizonte y tolerancia para el prompt', () => {
    const t = textoPerfil({ horizonte: 'largo', tolerancia: 'baja' })
    expect(t).toMatch(/largo plazo/)
    expect(t).toMatch(/tolerancia al riesgo baja/)
  })

  it('perfil activo con tolerancia alta', () => {
    const t = textoPerfil({ horizonte: 'activo', tolerancia: 'alta' })
    expect(t).toMatch(/activo/)
    expect(t).toMatch(/alta/)
  })
})
