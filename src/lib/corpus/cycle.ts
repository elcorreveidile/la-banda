import { engine } from '@/engine'
import { getDomain } from '@domains/index'
import * as clinica from '@/lib/clinica'

export const CORPUS_DOMAIN = 'corpus-ele'
/** Sesiones abiertas sin avance más antiguas que esto se abandonan (como en trading). */
export const STALE_SESSION_MS = 6 * 60 * 60_000
/** Traza de sesiones terminadas: se borra pasados estos días (CORPUS_TRACE_DAYS). */
export function traceMaxAgeMs(): number {
  const dias = Number(process.env.CORPUS_TRACE_DAYS ?? 30)
  return (Number.isFinite(dias) && dias > 0 ? dias : 30) * 24 * 60 * 60_000
}
/** Producciones que se recogen de la Clínica por ciclo (una sesión de diez agentes cada una). */
export const PENDIENTES_POR_CICLO = 3

export interface MuestraInput {
  situacion: string
  nivel: string
  tipo: 'muestra_habla' | 'texto_situado' | 'transcripcion_oral'
  fuente?: string | null
  licencia?: string | null
  notas?: string | null
}

export interface ProduccionInput {
  ref: string
  seudonimo: string
  texto: string
  nivel: string | null
  consigna: string | null
  lenguaMaterna: string | null
  origen: string
}

/** Abre una sesión de la cadena A (producir muestra). No arranca ticks: eso lo hace quien llama. */
export async function abrirMuestra(input: MuestraInput, createdBy: string) {
  const domain = getDomain(CORPUS_DOMAIN)
  return engine.openSession(domain, { kind: 'muestra', createdBy, payload: { kind: 'muestra', ...input } })
}

/** Abre una sesión de la cadena B (anotar producción seudonimizada). */
export async function abrirProduccion(input: ProduccionInput, createdBy: string) {
  const domain = getDomain(CORPUS_DOMAIN)
  return engine.openSession(domain, { kind: 'produccion', createdBy, payload: { kind: 'produccion', ...input } })
}

export interface CorpusCycleResult {
  opened: string[]
  resume: string[]
  abandoned: string[]
  purged: number
  error?: string
}

/**
 * Ciclo diario (cron): recoge de la Clínica las producciones pendientes con consentimiento,
 * abre una sesión por cada una, relanza sesiones abiertas recientes, abandona las colgadas
 * y purga la traza antigua. Quien llama arranca los ticks de `opened` + `resume`.
 */
export async function runCorpusCycle(createdBy: string): Promise<CorpusCycleResult> {
  const domain = getDomain(CORPUS_DOMAIN)
  const { resume, abandoned } = await engine.recoverOpen(domain, STALE_SESSION_MS)
  const purged = (await engine.purgeClosed(domain, traceMaxAgeMs())).length
  const opened: string[] = []
  const r = await clinica.produccionesPendientes(PENDIENTES_POR_CICLO)
  if (clinica.esError(r)) return { opened, resume, abandoned, purged, error: r.error }
  for (const p of r.producciones) {
    const { session } = await abrirProduccion({ ref: p.ref, seudonimo: p.seudonimo, texto: p.texto, nivel: p.nivel, consigna: p.consigna, lenguaMaterna: p.lenguaMaterna, origen: p.origen }, createdBy)
    opened.push(session.id)
  }
  return { opened, resume, abandoned, purged }
}
