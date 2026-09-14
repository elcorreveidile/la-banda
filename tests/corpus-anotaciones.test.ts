import { describe, expect, it } from 'vitest'
import { extraerAnotacionesDelDossier, extraerTextoDelDossier, filtrarPorEtiquetario, fusionarAnotaciones, fusionarConTexto, normalizarAnotacion, quitarInvalidas, resolverAnotacion } from '@/lib/corpus/anotaciones'
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
  it('también rescata listas anidadas bajo borrador (Berlín las metió ahí en la B2 «piso»)', () => {
    const p = { borrador: { texto: 'x', anotacionesBerlin: [{ capa: 'funcion', codigo: 'f4-pedir' }] } }
    expect(extraerAnotacionesDelDossier([p])).toEqual([p.borrador.anotacionesBerlin])
  })
})

describe('extraerTextoDelDossier', () => {
  const texto = 'MARTA: Hola, buenas. Llamo por el anuncio de la habitación.'
  it('prefiere el borrador más reciente de Río sobre la ficha de Nairobi', () => {
    const reciente = { ficha: { texto: null }, borrador: { anotacionesBerlin: [] } }
    const rio = { borrador: { texto, titulo: 'Piso' } }
    const viejo = { borrador: { texto: 'versión antigua del diálogo, ya corregida' } }
    expect(extraerTextoDelDossier([reciente, rio, viejo])).toEqual({ texto, origen: 'borrador' })
  })
  it('sin borrador, vale la ficha; sin nada (o demasiado corto), null', () => {
    expect(extraerTextoDelDossier([{ ficha: { texto } }])).toEqual({ texto, origen: 'ficha' })
    expect(extraerTextoDelDossier([{ borrador: { texto: 'corto' } }, null, 'x'])).toBeNull()
  })
})

describe('spans por cita (resolverAnotacion / fusionarConTexto)', () => {
  const texto = 'MARTA: Hola, buenas. Llamo por el anuncio de la habitación.'
  it('calcula inicio/fin buscando la cita exacta en el texto', () => {
    const r = resolverAnotacion({ capa: 'funcion', codigo: 'f5-saludar-despedir', cita: 'Hola, buenas' }, texto)
    const idx = texto.indexOf('Hola, buenas')
    expect(r).toEqual({ anotacion: { capa: 'funcion', codigo: 'f5-saludar-despedir', inicio: idx, fin: idx + 'Hola, buenas'.length, nota: null }, citaNoEncontrada: false })
  })
  it('la cita que no aparece se marca como no encontrada (y no se cuela)', () => {
    const r = resolverAnotacion({ capa: 'lexico', codigo: 'x', cita: 'no está en el texto' }, texto)
    expect(r.anotacion).toBeNull()
    expect(r.citaNoEncontrada).toBe(true)
  })
  it('sin cita, respeta el inicio/fin que traiga', () => {
    expect(resolverAnotacion({ capa: 'nivel', codigo: 'b2', inicio: 0, fin: 5 }, texto).anotacion).toMatchObject({ inicio: 0, fin: 5 })
  })
  it('fusionarConTexto resuelve, deduplica y descarta las citas ausentes', () => {
    const { anotaciones, descartadas } = fusionarConTexto(
      [[{ capa: 'funcion', codigo: 'f5-saludar-despedir', cita: 'Hola, buenas' }, { capa: 'lexico', codigo: 'inventado', cita: 'no aparece' }]],
      texto,
    )
    expect(anotaciones).toHaveLength(1)
    expect(anotaciones[0]).toMatchObject({ codigo: 'f5-saludar-despedir', inicio: texto.indexOf('Hola, buenas') })
    expect(descartadas.map((d) => d.motivo)).toEqual(['cita no encontrada en el texto'])
  })
  it('sin texto se comporta como fusionarAnotaciones', () => {
    const { anotaciones, descartadas } = fusionarConTexto([[{ capa: 'nivel', codigo: 'a2', inicio: 1, fin: 4 }]], '')
    expect(anotaciones).toHaveLength(1)
    expect(descartadas).toHaveLength(0)
  })
})
