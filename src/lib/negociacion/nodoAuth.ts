/**
 * Credencial por nodo (registro centralizado): al dar de alta un nodo, La Banda entrega UNA
 * vez una clave aleatoria y guarda solo su sha256. Toda acción en nombre de un nodo (abrir
 * como comprador, consultar, aprobar, rechazar, actualizar, dar de baja) lleva esa clave en
 * la cabecera `x-banda-nodo-clave`, además del Bearer de la API v1.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const CABECERA_CLAVE_NODO = 'x-banda-nodo-clave'

export function nuevaClaveNodo(): string {
  return `bn_${randomBytes(32).toString('base64url')}`
}

export function hashClave(clave: string): string {
  return createHash('sha256').update(clave).digest('hex')
}

/** ¿La clave casa con el hash guardado? (tiempo constante). */
export function claveValida(clave: string | null | undefined, hash: string | null | undefined): boolean {
  if (!clave || !hash) return false
  const a = Buffer.from(hashClave(clave), 'hex')
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
