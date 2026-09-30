// Vista de la pestaña Marketing: agrupar por web, filtrar, buscar y limitar. Puro, sin base de datos.
import type { EstadoTema } from '@/db/marketing'

export interface TemaVistaBase {
  destino: string
  estado: EstadoTema
  titulo: string
  angulo: string
  categoria: string
  palabrasClave: string[]
  updatedAt: Date
}

export interface FiltroVista {
  /** Solo esta web (vacío = todas). */
  dest?: string
  /** Texto a buscar en título, ángulo, categoría y palabras clave. */
  q?: string
  /** Enseñar también los archivados. */
  arch?: boolean
  /** Cuántos temas se ven por bloque. */
  n?: number
}

export const POR_BLOQUE = 10
export const MAX_POR_BLOQUE = 200

export interface Bloque<T> {
  items: T[]
  /** Total que cumple el filtro (puede ser más que los que se ven). */
  total: number
}

export interface GrupoWeb<T> {
  destino: string
  cuentas: { propuestos: number; aprobados: number; enMarcha: number; decidir: number; descartados: number; archivados: number }
  /** Propuestos y aprobados (los aprobados primero: son la cola de redacción). */
  pendientes: Bloque<T>
  decidir: Bloque<T>
  enMarcha: Bloque<T>
  descartados: Bloque<T>
  archivados: Bloque<T>
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function coincide(t: TemaVistaBase, q: string): boolean {
  const palabras = normalizar(q).split(/\s+/).filter(Boolean)
  if (!palabras.length) return true
  const texto = normalizar([t.titulo, t.angulo, t.categoria, t.palabrasClave.join(' ')].join(' '))
  return palabras.every((p) => texto.includes(p))
}

/** Lee el tamaño de bloque de la URL: entero entre POR_BLOQUE y MAX_POR_BLOQUE. */
export function tamanoBloque(raw: string | undefined): number {
  const n = parseInt(raw ?? '', 10)
  return Number.isFinite(n) ? Math.min(Math.max(n, POR_BLOQUE), MAX_POR_BLOQUE) : POR_BLOQUE
}

export function agruparPorWeb<T extends TemaVistaBase>(temas: T[], destinosConocidos: string[], filtro: FiltroVista = {}): GrupoWeb<T>[] {
  const n = tamanoBloque(filtro.n === undefined ? undefined : String(filtro.n))
  const q = filtro.q?.trim() ?? ''
  const webs = [...new Set([...destinosConocidos, ...temas.map((t) => t.destino)])].filter((d) => !filtro.dest || d === filtro.dest)
  const recientes = (a: T, b: T) => b.updatedAt.getTime() - a.updatedAt.getTime()

  return webs.map((destino) => {
    const todos = temas.filter((t) => t.destino === destino)
    const visibles = todos.filter((t) => coincide(t, q))
    const de = (estados: EstadoTema[], lista = visibles) => lista.filter((t) => estados.includes(t.estado)).sort(recientes)
    const bloque = (items: T[]): Bloque<T> => ({ items: items.slice(0, n), total: items.length })
    const pendientes = [...de(['aprobado']), ...de(['propuesto'])]
    const cuenta = (estados: EstadoTema[]) => todos.filter((t) => estados.includes(t.estado)).length
    return {
      destino,
      cuentas: {
        propuestos: cuenta(['propuesto']),
        aprobados: cuenta(['aprobado']),
        enMarcha: cuenta(['redactando', 'en_revision', 'publicado']),
        decidir: cuenta(['rechazado', 'vetado', 'fallido']),
        descartados: cuenta(['descartado']),
        archivados: cuenta(['archivado']),
      },
      pendientes: bloque(pendientes),
      decidir: bloque(de(['rechazado', 'vetado', 'fallido'])),
      enMarcha: bloque(de(['redactando', 'en_revision', 'publicado'])),
      descartados: bloque(de(['descartado'])),
      archivados: bloque(filtro.arch ? de(['archivado']) : []),
    }
  })
}

/** Query string de la pestaña con el filtro actual (para enlaces y para volver tras una acción). */
export function queryVista(f: FiltroVista, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams({ tab: 'marketing' })
  if (f.dest) p.set('dest', f.dest)
  if (f.q?.trim()) p.set('q', f.q.trim())
  if (f.arch) p.set('arch', '1')
  if (f.n && f.n > POR_BLOQUE) p.set('n', String(tamanoBloque(String(f.n))))
  for (const [k, v] of Object.entries(extra)) p.set(k, v)
  return p.toString()
}

/** Del `volver` de un formulario (query string) saca SOLO los campos del filtro. */
export function filtroDeQuery(raw: string | null | undefined): FiltroVista {
  const p = new URLSearchParams(raw ?? '')
  return {
    dest: p.get('dest')?.slice(0, 120) || undefined,
    q: p.get('q')?.slice(0, 120) || undefined,
    arch: p.get('arch') === '1',
    n: p.get('n') ? tamanoBloque(p.get('n') ?? undefined) : undefined,
  }
}
