/**
 * Cliente de la API del corpus de la Clínica Cultural (elcorreveidile/clinica-cultural,
 * rutas /api/corpus/*). La Clínica es la dueña de los datos (piezas, anotaciones,
 * consentimiento); La Banda solo produce y anota contra su API.
 *
 * Variables: CLINICA_URL (p. ej. https://www.clinicacultural.com) y CLINICA_CORPUS_KEY
 * (Bearer; la misma clave que la Clínica tiene en Vercel). Patrón demo-safe: sin ellas,
 * `hasClinica()` es false y todas las llamadas devuelven { error } sin lanzar.
 */

import { fetchLimpio } from '@/lib/httpLimpio'

const TIMEOUT_MS = 20_000

export interface EtiquetaCorpus {
  capa: string
  codigo: string
  nombre: string
  definicion: string
  inventarioPcic?: string
  nivelMin?: string
}
export interface Etiquetario {
  version: number
  capas: { capa: string; nombre: string }[]
  etiquetas: EtiquetaCorpus[]
}
export interface AnotacionCorpus {
  capa: string
  codigo: string
  inicio?: number | null
  fin?: number | null
  nota?: string | null
}
export interface PiezaCorpus {
  id: string
  tipo: string
  titulo: string
  texto: string
  nivel: string
  situacion: string | null
  procedencia: string
  fuente: string | null
  estado: string
  anotaciones?: AnotacionCorpus[]
}
export interface NuevaPieza {
  tipo: 'muestra_habla' | 'texto_situado' | 'transcripcion_oral' | 'texto_escrito'
  titulo: string
  texto: string
  nivel: string
  situacion?: string | null
  procedencia: 'autentica' | 'adaptada' | 'generada'
  fuente?: string | null
  licencia?: string | null
  fenomenos?: string[]
  estado?: 'borrador' | 'validada'
  bandaSessionId?: string | null
  anotaciones?: AnotacionCorpus[]
}
export interface ProduccionPendiente {
  tipo: 'redaccion'
  ref: string
  seudonimo: string
  nivel: string | null
  lenguaMaterna: string | null
  consigna: string | null
  origen: string
  palabras: number
  texto: string
  createdAt: string
}

/** Un error lleva `detalle` con el cuerpo JSON del 4xx cuando lo hay (p. ej. `invalidas` en un 400). */
export type Resultado<T> = T | { error: string; detalle?: unknown }

export function hasClinica(): boolean {
  return Boolean(process.env.CLINICA_URL?.trim() && process.env.CLINICA_CORPUS_KEY?.trim())
}

function base(): string {
  return (process.env.CLINICA_URL ?? '').trim().replace(/\/+$/, '')
}

async function llamar<T>(path: string, init: { method?: string; body?: string } = {}): Promise<Resultado<T>> {
  if (!hasClinica()) return { error: 'Clínica no configurada (CLINICA_URL / CLINICA_CORPUS_KEY)' }
  try {
    // fetchLimpio y no fetch: la Clínica también es Vercel y su borde devuelve 508 si la
    // petición llega con la traza x-vercel-id de la cadena de ticks (≥ ~6 saltos).
    const res = await fetchLimpio(`${base()}${path}`, {
      method: init.method ?? 'GET',
      body: init.body,
      headers: {
        authorization: `Bearer ${process.env.CLINICA_CORPUS_KEY!.trim()}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      timeoutMs: TIMEOUT_MS,
    })
    const body = (await res.json<T & { error?: string }>().catch(() => null)) as (T & { error?: string }) | null
    if (!res.ok) return { error: `Clínica ${res.status}: ${body?.error ?? res.statusText}`, detalle: body ?? undefined }
    if (!body) return { error: 'Clínica: respuesta vacía' }
    return body
  } catch (err) {
    return { error: `Clínica: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export function esError<T>(r: Resultado<T>): r is { error: string; detalle?: unknown } {
  return typeof r === 'object' && r !== null && 'error' in r && typeof (r as { error?: unknown }).error === 'string'
}

/** GET /api/corpus/etiquetario — el etiquetario cerrado y versionado. */
export const etiquetario = () => llamar<Etiquetario>('/api/corpus/etiquetario')

/** GET /api/corpus/pcic/<inventario> — chuleta destilada del PCIC (lista blanca en la Clínica). */
export const pcic = (inventario: string) => llamar<{ inventario: string; markdown: string }>(`/api/corpus/pcic/${encodeURIComponent(inventario)}`)

/** GET /api/corpus/piezas — búsqueda de piezas del corpus de referencia. */
export function buscarPiezas(q: { nivel?: string | null; situacion?: string | null; q?: string | null; estado?: string | null; take?: number }) {
  const p = new URLSearchParams()
  if (q.nivel) p.set('nivel', q.nivel)
  if (q.situacion) p.set('situacion', q.situacion)
  if (q.q) p.set('q', q.q)
  if (q.estado) p.set('estado', q.estado)
  if (q.take) p.set('take', String(q.take))
  const qs = p.toString()
  return llamar<{ piezas: PiezaCorpus[] }>(`/api/corpus/piezas${qs ? `?${qs}` : ''}`)
}

/** POST /api/corpus/piezas — registra una pieza (nunca nace pública: publicar es humano). */
export const crearPieza = (body: NuevaPieza) => llamar<{ ok: true; pieza: { id: string; estado: string } }>('/api/corpus/piezas', { method: 'POST', body: JSON.stringify(body) })

/** POST /api/corpus/anotaciones — sustituye las anotaciones de La Banda sobre una producción. */
export const escribirAnotaciones = (body: { produccionTipo: 'redaccion'; produccionRef: string; bandaSessionId?: string | null; anotaciones: AnotacionCorpus[] }) =>
  llamar<{ ok: true; anotaciones: number }>('/api/corpus/anotaciones', { method: 'POST', body: JSON.stringify(body) })

/** GET /api/corpus/producciones/pendientes — redacciones en cola con consentimiento, seudonimizadas. */
export const produccionesPendientes = (take = 3) => llamar<{ producciones: ProduccionPendiente[] }>(`/api/corpus/producciones/pendientes?take=${take}`)
