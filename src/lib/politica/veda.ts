// ¿El texto parece citar cifras de un sondeo? Misma heurística que el sondeo (sondeo-29n/src/lib/veda.ts):
// ayuda a Palermo y al código, no sustituye al criterio de la persona que revisa.
const POLL_WORDS =
  /(encuesta|sondeo|bar[oó]metro|estimaci[oó]n de voto|intenci[oó]n de voto|\bCIS\b|40dB|Sigma Dos|SocioM[eé]trica|GAD3|NC Report|Simple L[oó]gica|Target Point|\bDYM\b|Cluster17|electoPanel|media de encuestas)/i
const FIGURES = /(\d+(?:[.,]\d+)?\s?%|\d+(?:[.,]\d+)?\s?(?:puntos|escaños|diputados|puntos porcentuales)|\b\d{2,3}\s?seats)/i

export function mencionaCifrasDeSondeos(texto: string): boolean {
  const plano = texto.replace(/\s+/g, ' ')
  const re = new RegExp(POLL_WORDS.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(plano))) {
    const ventana = plano.slice(Math.max(0, m.index - 140), m.index + m[0].length + 140)
    if (FIGURES.test(ventana)) return true
  }
  return false
}
