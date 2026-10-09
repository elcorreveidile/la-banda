/**
 * Perfil de inversión del usuario: horizonte (largo plazo vs activo) y tolerancia al riesgo. La mesa lo
 * usa para adaptar la recomendación. `parsePerfil`/`textoPerfil` son puros; las lecturas/escrituras BD
 * aparte. Un solo usuario en la práctica (ALLOWED_EMAILS).
 */
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { tradingPerfil } from '@/db/trading'

export type Horizonte = 'largo' | 'activo'
export type Tolerancia = 'baja' | 'media' | 'alta'
export interface Perfil {
  horizonte: Horizonte
  tolerancia: Tolerancia
}

export const PERFIL_DEF: Perfil = { horizonte: 'largo', tolerancia: 'media' }

export function parsePerfil(h: unknown, t: unknown): Perfil {
  return {
    horizonte: h === 'activo' ? 'activo' : 'largo',
    tolerancia: t === 'baja' ? 'baja' : t === 'alta' ? 'alta' : 'media',
  }
}

/** Frase para el prompt: cómo debe adaptar la mesa el consejo a este perfil. */
export function textoPerfil(p: Perfil): string {
  const hz = p.horizonte === 'largo' ? 'largo plazo (prioriza "mantener"; menos trading de corto)' : 'activo (más peso al corto plazo y a aprovechar movimientos)'
  const tol =
    p.tolerancia === 'baja'
      ? 'baja (niveles conservadores; sé prudente con "comprar", antes "mantener")'
      : p.tolerancia === 'alta'
        ? 'alta (admite más riesgo si hay base)'
        : 'media'
  return `horizonte ${hz}; tolerancia al riesgo ${tol}`
}

export async function leerPerfil(owner: string): Promise<Perfil | null> {
  const [r] = await db.select().from(tradingPerfil).where(eq(tradingPerfil.owner, owner))
  return r ? parsePerfil(r.horizonte, r.tolerancia) : null
}

/** Perfil del único usuario (para sembrarlo en el ciclo global de la mesa). */
export async function leerPerfilUnico(): Promise<Perfil | null> {
  const [r] = await db.select().from(tradingPerfil).limit(1)
  return r ? parsePerfil(r.horizonte, r.tolerancia) : null
}

export async function guardarPerfilDb(owner: string, p: Perfil): Promise<void> {
  await db
    .insert(tradingPerfil)
    .values({ owner, horizonte: p.horizonte, tolerancia: p.tolerancia })
    .onConflictDoUpdate({ target: tradingPerfil.owner, set: { horizonte: p.horizonte, tolerancia: p.tolerancia, updatedAt: new Date() } })
}
