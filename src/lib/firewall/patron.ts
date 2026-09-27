/**
 * Clave de patrón y presentación segura del dato que no es de fiar (puro, sin BD).
 *
 * El caché del firewall agrupa cuarentenas «iguales»: mismo motivo, mismo destino y
 * mismo fragmento una vez normalizado (NFKC, minúsculas, espacios colapsados, cifras → «#»,
 * sin caracteres invisibles). Así «ignore previous instructions 123» y
 * «IGNORE   previous​ instructions 456» comparten veredicto.
 */

import { createHash, randomBytes } from 'node:crypto'

/** Caracteres de formato/invisibles (ZWSP, ZWJ, BOM, marcas bidi, etiquetas Unicode…). */
const INVISIBLES = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ\u{e0000}-\u{e007f}]/gu

/** Fragmento normalizado para la clave de patrón. */
export function normalizarFragmento(texto: string | null | undefined): string {
  if (!texto) return ''
  return texto
    .normalize('NFKC')
    .replace(INVISIBLES, '')
    .toLowerCase()
    .replace(/\p{Nd}/gu, '#')
    .replace(/\s+/gu, ' ')
    .trim()
}

/** sha256(motivo \n destino \n fragmento normalizado), en hex. */
export function patternKey(reason: string, target: string, detail: string | null | undefined): string {
  const destino = target.normalize('NFKC').trim().toLowerCase()
  return createHash('sha256').update(`${reason}\n${destino}\n${normalizarFragmento(detail)}`).digest('hex')
}

/**
 * Hace visibles los caracteres invisibles y de control (`<U+200B>`), para que los agentes
 * vean que están ahí sin que actúen sobre el modelo. El resto del texto queda igual.
 */
export function visibilizar(texto: string): string {
  return texto.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, (c) => `<U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}>`).replace(INVISIBLES, (c) => `<U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}>`)
}

/**
 * Envuelve un dato del atacante entre marcas con un testigo aleatorio: el fragmento no puede
 * «cerrar» el bloque porque no conoce el testigo. Los prompts dicen que lo que va dentro es
 * DATO que se analiza, nunca instrucción.
 */
export function delimitar(campo: string, valor: string | null | undefined, testigo = randomBytes(6).toString('hex')): string {
  if (valor === null || valor === undefined || valor === '') return `(sin ${campo})`
  const marca = `DATO_NO_FIABLE_${testigo}`
  return `<<<${marca} ${campo}>>>\n${visibilizar(valor)}\n<<<FIN_${marca}>>>`
}
