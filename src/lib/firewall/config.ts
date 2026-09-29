import { hayClavePara, modeloEfectivo } from '@/engine/provider'

/**
 * Ajustes del carril profundo del firewall (todos por env, con valores por defecto).
 */

export const FIREWALL_DOMAIN = 'firewall'

const numero = (v: string | undefined, def: number, min = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > min ? n : def
}

/** Vigencia de un veredicto cacheado y de los datos de persona (FIREWALL_CACHE_TTL_DIAS, def. 30). */
export function cacheTtlMs(): number {
  return numero(process.env.FIREWALL_CACHE_TTL_DIAS, 30) * 24 * 60 * 60_000
}

/** Mesas nuevas por tenant y día UTC (FIREWALL_MAX_POR_TENANT_DIA, def. 50). Caché y espera no cuentan. */
export function maxPorTenantDia(): number {
  return Math.floor(numero(process.env.FIREWALL_MAX_POR_TENANT_DIA, 50))
}

/** Solo se cachean los veredictos con al menos esta confianza. */
export const CONFIANZA_MINIMA_CACHE = 0.7

/**
 * Modelos. Anthropic por defecto; z.ai solo si se pide explícitamente (`zai:glm-…`), nunca
 * por defecto para tráfico de clientes.
 */
export const MODELO_MESA_DEFECTO = 'anthropic:claude-sonnet-5'
export const MODELO_JUEZ_DEFECTO = 'anthropic:claude-opus-5-5'

/** Sin prefijo de proveedor se entiende Anthropic (sin prefijo, `providerFor` usaría el predeterminado, que puede ser z.ai). */
/** Con Anthropic apagado (sin ANTHROPIC_ACTIVO=1), el resultado pasa a z.ai (`modeloEfectivo`). */
export function conProveedor(m: string, env: Record<string, string | undefined> = process.env): string {
  return modeloEfectivo(/^(anthropic|zai):/.test(m) ? m : `anthropic:${m}`, env)
}
export function modeloMesa(env: Record<string, string | undefined> = process.env): string {
  return conProveedor(env.FIREWALL_MODELO_MESA?.trim() || MODELO_MESA_DEFECTO, env)
}
export function modeloJuez(env: Record<string, string | undefined> = process.env): string {
  return conProveedor(env.FIREWALL_MODELO_JUEZ?.trim() || MODELO_JUEZ_DEFECTO, env)
}

/**
 * ¿Hay clave para el proveedor NOMBRADO de cada modelo? Sin ella `providerFor` caería al
 * predeterminado (que puede ser z.ai): aquí se prefiere no abrir la mesa (503) antes que
 * mandar tráfico de clientes a un proveedor que nadie eligió.
 */
export function modelosDisponibles(env: Record<string, string | undefined> = process.env): boolean {
  return [modeloMesa(env), modeloJuez(env)].every((m) => hayClavePara(m, env))
}

/** Inicio del día UTC de `now`. */
export function inicioDiaUtc(now: number): Date {
  const d = new Date(now)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
