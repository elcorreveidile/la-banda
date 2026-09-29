/**
 * Ajustes de la negociación B2B (por env, con valores por defecto).
 * Anthropic por defecto para el tráfico de clientes; z.ai solo si se pide (`zai:…`).
 */

import { hayClavePara } from '@/engine/provider'
import { conProveedor } from '@/lib/firewall/config'

export const NEGOCIACION_DOMAIN = 'negociacion'

export const MODELO_MESA_DEFECTO = 'anthropic:claude-sonnet-5'
export const MODELO_JUEZ_DEFECTO = 'anthropic:claude-opus-5-5'

export function modeloMesa(env: Record<string, string | undefined> = process.env): string {
  return conProveedor(env.NEGOCIACION_MODELO_MESA?.trim() || MODELO_MESA_DEFECTO, env)
}
export function modeloJuez(env: Record<string, string | undefined> = process.env): string {
  return conProveedor(env.NEGOCIACION_MODELO_JUEZ?.trim() || MODELO_JUEZ_DEFECTO, env)
}

/** Sin la clave del proveedor nombrado no se abre mesa (nunca se cae a z.ai por defecto). */
export function modelosDisponibles(env: Record<string, string | undefined> = process.env): boolean {
  return [modeloMesa(env), modeloJuez(env)].every((m) => hayClavePara(m, env))
}

/** Negociaciones nuevas por comprador y día UTC (NEGOCIACION_MAX_POR_NODO_DIA, def. 20). */
export function maxPorNodoDia(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.NEGOCIACION_MAX_POR_NODO_DIA)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20
}

/** Una propuesta sin aprobar de las dos partes caduca a los 7 días. */
export const PROPUESTA_TTL_MS = 7 * 24 * 60 * 60_000

/** Mesa colgada: pasados 90 min sin terminar, se abandona (fallida). */
export const MESA_MAX_MS = 90 * 60_000
