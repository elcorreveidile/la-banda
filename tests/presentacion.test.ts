import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { corpusEleDomain as corpus } from '@domains/corpus-ele/config'
import avatares from '@/lib/panel/avatares.json'
import { INTRO_CORPUS, ORDEN_CADENA, presentacionDe } from '@/lib/corpus/presentacion'

const idiomas = ['es', 'en'] as const

describe('presentación de los agentes del corpus', () => {
  it('cubre exactamente a los agentes del dominio, en el orden de la cadena', () => {
    expect([...ORDEN_CADENA]).toEqual(corpus.agents.map((a) => a.codename))
  })

  it('cada agente tiene guion, rol, avatar y vídeo en los dos idiomas', () => {
    for (const nombre of ORDEN_CADENA) {
      expect(avatares).toHaveProperty(nombre)
      for (const l of idiomas) {
        const p = presentacionDe(nombre, l)
        expect(p, `${nombre} ${l}`).not.toBeNull()
        expect(p!.rol.length).toBeGreaterThan(3)
        expect(p!.guion.split(/\s+/).length).toBeGreaterThan(25)
        expect(p!.guion.split(/\s+/).length).toBeLessThan(90)
        for (const f of [p!.video, p!.poster]) expect(existsSync(join(process.cwd(), 'public', f)), f).toBe(true)
      }
    }
  })

  it('el guion se presenta con su propio nombre y tiene introducción en los dos idiomas', () => {
    for (const l of idiomas) {
      expect(INTRO_CORPUS[l].texto.length).toBeGreaterThan(80)
      expect(presentacionDe('Profesor', l)!.guion).toMatch(/Profesor|Professor/)
    }
  })
})
