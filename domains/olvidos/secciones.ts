/**
 * Secciones de Olvidos de Granada y su espacio (herramienta getSectionLimits).
 *
 * PROPUESTA a partir del repo `olvidos` (2026-09-12): categorías web
 * (Editoriales, Palabras, Piezas y Procesos, Soneto500) y extensiones reales del
 * nº 9 transcrito (editoriales 300-700 palabras; piezas y reseñas 450-1300;
 * ensayos 1.200-2.300; los dos ensayos largos 6.000-6.350). Javier corrige.
 */
export interface SectionLimits {
  key: string
  name: string
  description: string
  /** Palabras (null = no se mide por palabras). */
  minWords: number | null
  maxWords: number | null
  /** Versos (solo poesía y soneto). */
  minLines?: number
  maxLines?: number
  notes: string
}

export const SECCIONES: SectionLimits[] = [
  { key: 'editorial', name: 'Editoriales', description: 'Opinión de la revista; firma «Editorial».', minWords: 350, maxWords: 900, notes: 'Una idea, una postura. Sin firma personal.' },
  { key: 'palabras-narrativa', name: 'Palabras · narrativa', description: 'Relato, prosa de creación.', minWords: 500, maxWords: 3000, notes: 'Extensión de una entrega; si supera el máximo, proponer serie.' },
  { key: 'palabras-poesia', name: 'Palabras · poesía', description: 'Poemas o series de poemas.', minWords: null, maxWords: null, minLines: 4, maxLines: 80, notes: 'Se mide en versos, no en palabras.' },
  { key: 'piezas-y-procesos', name: 'Piezas y Procesos', description: 'Procesos creativos, obras en desarrollo, crónica de trabajo.', minWords: 600, maxWords: 2500, notes: 'Puede llevar imágenes con pie y crédito.' },
  { key: 'soneto500', name: 'Soneto500', description: 'Sección especial de sonetos.', minWords: null, maxWords: null, minLines: 14, maxLines: 14, notes: 'Catorce versos; forma de soneto (dos cuartetos y dos tercetos, o variante reconocible).' },
  { key: 'ensayo', name: 'Ensayo (secciones de la impresa: Mitológicas, La fábrica de sueños…)', description: 'Ensayo largo con secciones numeradas, epígrafes y citas.', minWords: 1200, maxWords: 6500, notes: 'Por encima de 4.000 palabras, avisar: solo cabe como pieza central del número.' },
  { key: 'entrevista', name: 'Entrevista', description: 'Conversación con interlocutores en negrita (formato B. P. / C. R.).', minWords: 1000, maxWords: 3000, notes: 'Preguntas cortas; cortar lo que no aporte.' },
  { key: 'apostillas', name: 'Apostillas', description: 'Notas y comentarios de la redacción sobre la historia de la revista, presentaciones y efemérides (categoría de la web actual).', minWords: 600, maxWords: 4000, notes: 'Contexto y fuentes explícitas; los textos largos, con secciones.' },
  { key: 'resena', name: 'Reseña / crónica breve', description: 'Reseña de libro, exposición, encuentro.', minWords: 400, maxWords: 1200, notes: 'Datos completos de la obra reseñada (título, autor, editorial, año).' },
]

export function getSection(key: string): SectionLimits | undefined {
  return SECCIONES.find((s) => s.key === key)
}

/** Cuenta palabras de un texto plano/Markdown (sin marcas). */
export function countWords(text: string): number {
  return text
    .replace(/[#*_>`~\[\]()]/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length
}

/** Cuenta versos: líneas no vacías que no sean títulos. */
export function countLines(text: string): number {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#')).length
}

export interface FitResult {
  section: SectionLimits
  words: number
  lines: number
  fits: boolean
  note: string
}

/** Compara un texto con el espacio de su sección. */
export function measureAgainstSection(text: string, sectionKey: string): FitResult | { error: string } {
  const section = getSection(sectionKey)
  if (!section) return { error: `sección desconocida: ${sectionKey}` }
  const words = countWords(text)
  const lines = countLines(text)
  const problems: string[] = []
  if (section.minWords != null && words < section.minWords) problems.push(`faltan ${section.minWords - words} palabras para el mínimo (${section.minWords})`)
  if (section.maxWords != null && words > section.maxWords) problems.push(`sobran ${words - section.maxWords} palabras sobre el máximo (${section.maxWords})`)
  if (section.minLines != null && lines < section.minLines) problems.push(`faltan versos: ${lines} de ${section.minLines} mínimos`)
  if (section.maxLines != null && lines > section.maxLines) problems.push(`sobran versos: ${lines} sobre ${section.maxLines}`)
  return { section, words, lines, fits: problems.length === 0, note: problems.length ? problems.join('; ') : 'dentro del espacio de la sección' }
}
