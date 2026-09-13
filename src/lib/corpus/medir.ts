/**
 * Medidas objetivas de un texto para la cadena B (Estocolmo): solo pistas, nunca un
 * veredicto de nivel. Puro y determinista (se testea sin red).
 */

export interface MedidaTexto {
  palabras: number
  frases: number
  palabrasPorFrase: number
  /** Tipos / palabras (riqueza léxica, 0-1). */
  riquezaLexica: number
  /** Marcas superficiales que suelen aparecer por banda (solo orientativas). */
  marcas: {
    subjuntivo: number
    conectores: number
    pasados: number
    condicional: number
  }
  /** Banda sugerida por longitud y marcas: A, B o C (orientativa). */
  bandaSugerida: 'A' | 'B' | 'C'
}

const CONECTORES = ['sin embargo', 'no obstante', 'aunque', 'por lo tanto', 'además', 'es decir', 'o sea', 'en cambio', 'por eso', 'así que', 'mientras que', 'a pesar de']
const SUBJ = /\b\w+(?:ara|iera|ase|iese|áramos|iéramos|ásemos|iésemos|aran|ieran|asen|iesen)\b|\b(?:sea|seas|seamos|sean|haya|hayas|hayamos|hayan|tenga|tengas|tengamos|tengan|pueda|puedas|puedan|quiera|quieras|quieran|vaya|vayas|vayan|esté|estés|estén|hagas|haga|hagan)\b/gi
const PASADOS = /\b\w+(?:aba|abas|ábamos|aban|ía|ías|íamos|ían|ó|aste|amos|aron|ió|iste|ieron|imos)\b/gi
const CONDICIONAL = /\b\w+(?:aría|arías|aríamos|arían|ería|erías|erían|iría|irías|irían)\b/gi

export function medirTexto(texto: string): MedidaTexto {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  const tokens = limpio.toLowerCase().match(/[a-záéíóúüñ]+/gi) ?? []
  const palabras = tokens.length
  const frases = Math.max(1, (limpio.match(/[.!?…]+(\s|$)/g) ?? []).length || (palabras > 0 ? 1 : 0))
  const tipos = new Set(tokens).size
  const cuenta = (re: RegExp) => (limpio.match(re) ?? []).length
  const conectores = CONECTORES.reduce((n, c) => n + (limpio.toLowerCase().includes(c) ? 1 : 0), 0)
  const marcas = { subjuntivo: cuenta(SUBJ), conectores, pasados: cuenta(PASADOS), condicional: cuenta(CONDICIONAL) }
  const palabrasPorFrase = palabras / frases
  let banda: 'A' | 'B' | 'C' = 'A'
  if (palabras >= 80 && (marcas.pasados >= 2 || marcas.conectores >= 1 || palabrasPorFrase >= 11)) banda = 'B'
  if (palabras >= 150 && marcas.subjuntivo >= 2 && marcas.conectores >= 2 && palabrasPorFrase >= 14) banda = 'C'
  return { palabras, frases, palabrasPorFrase: Math.round(palabrasPorFrase * 10) / 10, riquezaLexica: palabras ? Math.round((tipos / palabras) * 100) / 100 : 0, marcas, bandaSugerida: banda }
}
