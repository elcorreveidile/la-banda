/**
 * Guarda de contenido: los agentes citan párrafos del brief o la petición como
 * «[¶n]» para justificar decisiones en el dossier. Esos marcadores son internos
 * y no deben llegar al cliente; aquí se quitan de los textos entregables
 * (bloques, HTML del paquete, informe), como red de seguridad por si un agente
 * los copia al contenido.
 */

/** Quita los marcadores «[¶…]» y ordena los espacios que dejan tras de sí. */
export function quitarCitas(texto: string): string {
  return texto
    .replace(/\[¶[^\]]*\]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/ +([.,;:!?»)])/g, '$1')
    .trim()
}
