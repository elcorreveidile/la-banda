import data from './presentacion.json'

export type Idioma = 'es' | 'en'

type Texto = { rol: string; guion: string }
type Agente = { voz: Record<Idioma, string[]> } & Record<Idioma, Texto>

const AGENTES = data.agentes as Record<string, Agente>

/** Orden de la cadena del corpus (el de `domains/corpus-ele/config.ts`). */
export const ORDEN_CADENA = ['Tokio', 'Denver', 'Estocolmo', 'Río', 'Berlín', 'Lisboa', 'Nairobi', 'Palermo', 'Helsinki', 'Profesor'] as const

export const INTRO_CORPUS = data.intro as Record<Idioma, { titulo: string; texto: string }>

/** Nombre de fichero de los vídeos (sin tildes, minúsculas), p. ej. `rio-es`. Lo genera `scripts/videos-agentes.mjs`. */
export function ficheroAgente(codename: string): string {
  return codename.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function presentacionDe(codename: string, idioma: Idioma): (Texto & { video: string; poster: string }) | null {
  const a = AGENTES[codename]
  if (!a) return null
  const base = `/agentes/${ficheroAgente(codename)}-${idioma}`
  return { ...a[idioma], video: `${base}.mp4`, poster: `${base}.jpg` }
}
