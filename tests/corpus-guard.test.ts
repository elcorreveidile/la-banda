import { describe, expect, it, vi, beforeEach } from 'vitest'

// `payloadsDeTarea` lee de la BD; sin dossier, la cadena resuelve a [].
vi.mock('@/db', () => {
  const chain: { from: () => typeof chain; where: () => typeof chain; orderBy: () => Promise<unknown[]> } = {
    from: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve([]),
  }
  return { db: { select: () => chain } }
})
// Clínica: etiquetario en error (no filtra) y crearPieza que devuelve el estado con el que se la llama.
vi.mock('@/lib/clinica', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/clinica')>()
  return { ...actual, crearPieza: vi.fn(), etiquetario: vi.fn() }
})

import * as clinica from '@/lib/clinica'
import { corpusTools } from '@domains/corpus-ele/tools'

const ctx = { sessionId: 's1', taskId: 't1', agentCodename: 'Helsinki' }

describe('escribirPieza — guarda de credibilidad (0 anotaciones → borrador)', () => {
  beforeEach(() => {
    vi.mocked(clinica.etiquetario).mockResolvedValue({ error: 'sin etiquetario' } as never)
    vi.mocked(clinica.crearPieza).mockImplementation(async (body) => ({ ok: true, pieza: { id: 'p1', estado: body.estado } }) as never)
  })

  it('una muestra sin anotaciones se registra como borrador aunque se pida validada', async () => {
    const r = (await corpusTools.escribirPieza.run(
      { tipo: 'muestra_habla', titulo: 'En el bar', texto: 'Hola, ¿qué te pongo? Una caña, por favor.', nivel: 'A2', procedencia: 'generada', estado: 'validada', anotaciones: [] },
      ctx,
    )) as { registrada: boolean; estado: string; anotaciones: number; forzadoBorrador: boolean }
    expect(r.registrada).toBe(true)
    expect(r.anotaciones).toBe(0)
    expect(r.estado).toBe('borrador')
    expect(r.forzadoBorrador).toBe(true)
    expect(vi.mocked(clinica.crearPieza).mock.calls[0][0].estado).toBe('borrador')
  })

  it('con anotaciones válidas respeta el estado pedido (validada)', async () => {
    const r = (await corpusTools.escribirPieza.run(
      {
        tipo: 'muestra_habla',
        titulo: 'En el bar',
        texto: 'Una caña, por favor, que aquí la tapa va con la bebida.',
        nivel: 'A2',
        procedencia: 'generada',
        estado: 'validada',
        anotaciones: [{ capa: 'cultura', codigo: 'tapa', cita: 'la tapa va con la bebida' }],
      },
      ctx,
    )) as { estado: string; anotaciones: number; forzadoBorrador: boolean }
    expect(r.anotaciones).toBeGreaterThan(0)
    expect(r.estado).toBe('validada')
    expect(r.forzadoBorrador).toBe(false)
  })
})
