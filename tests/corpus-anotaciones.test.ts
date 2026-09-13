import { describe, expect, it } from 'vitest'
import { extraerAnotacionesDelDossier, filtrarPorEtiquetario, fusionarAnotaciones, normalizarAnotacion, quitarInvalidas } from '@/lib/corpus/anotaciones'
import type { Etiquetario } from '@/lib/clinica'

describe('normalizarAnotacion', () => {
  it('quita el prefijo de capa del código y limpia', () => {
    expect(normalizarAnotacion({ capa: 'funcion', codigo: 'funcion:F5-Saludar-Despedir', inicio: 181, fin: 204, nota: ' saludo ' })).toEqual({ capa: 'funcion', codigo: 'f5-saludar-despedir', inicio: 181, fin: 204, nota: 'saludo' })
    expect(normalizarAnotacion({ capa: '', codigo: 'cultura:tapa' })).toMatchObject({ capa: 'cultura', codigo: 'tapa' })
    expect(normalizarAnotacion({ capa: 'lexico', codigo: 'x', inicio: 10, fin: 3 })).toMatchObject({ inicio: null, fin: null })
    expect(normalizarAnotacion({ capa: 'lexico', codigo: '' })).toBeNull()
    expect(normalizarAnotacion('nada')).toBeNull()
  })
})

describe('fusionarAnotaciones', () => {
  it('une listas sin duplicados, ordena por posición y conserva la nota más larga', () => {
    const r = fusionarAnotaciones([
      [{ capa: 'funcion', codigo: 'funcion:f4-pedir', inicio: 320, fin: 326, nota: 'corta' }],
      [{ capa: 'funcion', codigo: 'f4-pedir', inicio: 320, fin: 326, nota: 'nota más larga' }, { capa: 'cultura', codigo: 'tapa', inicio: 10, fin: 20 }, { capa: 'nivel', codigo: 'a2' }],
    ])
    expect(r.map((a) => `${a.capa}:${a.codigo}`)).toEqual(['cultura:tapa', 'funcion:f4-pedir', 'nivel:a2'])
    expect(r[1].nota).toBe('nota más larga')
  })
  it('respeta el máximo', () => {
    const muchas = Array.from({ length: 70 }, (_, i) => ({ capa: 'lexico', codigo: `c${i}`, inicio: i, fin: i + 1 }))
    expect(fusionarAnotaciones([muchas], 60)).toHaveLength(60)
  })
})

const ET: Etiquetario = { version: 1, capas: [], etiquetas: [{ capa: 'funcion', codigo: 'f4-pedir', nombre: 'Pedir', definicion: '' }, { capa: 'nivel', codigo: 'a2', nombre: 'A2', definicion: '' }] }

describe('filtrarPorEtiquetario y quitarInvalidas', () => {
  it('separa válidas de inventadas', () => {
    const { validas, descartadas } = filtrarPorEtiquetario([{ capa: 'funcion', codigo: 'f4-pedir' }, { capa: 'cultura', codigo: 'tapa' }], ET)
    expect(validas).toHaveLength(1)
    expect(descartadas).toEqual([{ capa: 'cultura', codigo: 'tapa', motivo: 'no está en el etiquetario' }])
  })
  it('quita lo que la Clínica rechazó (con o sin prefijo)', () => {
    const { validas, descartadas } = quitarInvalidas([{ capa: 'funcion', codigo: 'f4-pedir' }, { capa: 'fonetica', codigo: 'seseo' }, { capa: 'nivel', codigo: 'a2' }], ['fonetica:seseo', 'a2'])
    expect(validas).toEqual([{ capa: 'funcion', codigo: 'f4-pedir' }])
    expect(descartadas.map((d) => d.codigo)).toEqual(['seseo', 'a2'])
  })
})

describe('extraerAnotacionesDelDossier', () => {
  it('toma la versión más reciente de cada lista y las de la ficha', () => {
    const reciente = { anotacionesBerlin: [{ capa: 'funcion', codigo: 'f4-pedir' }], ficha: { anotaciones: [{ capa: 'nivel', codigo: 'a2' }] } }
    const antiguo = { anotacionesBerlin: [{ capa: 'funcion', codigo: 'inventado' }], anotacionesLisboa: [{ capa: 'cultura', codigo: 'tapa' }] }
    const listas = extraerAnotacionesDelDossier([reciente, antiguo, null, 'x'])
    expect(listas).toEqual([reciente.anotacionesBerlin, reciente.ficha.anotaciones, antiguo.anotacionesLisboa])
  })
})
