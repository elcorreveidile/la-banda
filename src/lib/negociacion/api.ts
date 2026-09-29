/**
 * Manejadores de la API v1 de la red de webs (las rutas solo inyectan dependencias).
 * Todas exigen `Authorization: Bearer LA_BANDA_API_KEY` (el servidor de WordNext) y, cuando
 * actúan en nombre de un nodo, `x-banda-nodo` (id) + `x-banda-nodo-clave` (su credencial).
 * Contrato completo en el CLAUDE.md y en la descripción del PR de la Fase 4a.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiUnauthorized } from '@/lib/apiAuth'
import { abrirNegociacion, bajaNodo, decidir, fichaPublica, parteDe, registrarNodo, type DepsAbrir } from './ciclo'
import { CABECERA_CLAVE_NODO } from './nodoAuth'
import { MAX_CANTIDAD, MAX_LINEAS, RONDAS_MAX_TOPE, DESCUENTO_MAX_TOPE } from './reglas'
import type { RedStore } from './store'
import { salidaNegociacion } from './vistas'
import type { DepsAvisoNeg } from './webhook'

export const CABECERA_NODO = 'x-banda-nodo'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const errores = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
const cents = z.number().int().nonnegative().max(100_000_000)
const id = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_.:-]+$/)

export const NodoBody = z.object({
  tenantId: id,
  host: z.string().trim().min(3).max(253),
  nombre: z.string().trim().min(1).max(120),
  sector: z.string().trim().min(1).max(40).default('general'),
  capacidades: z.array(z.enum(['quote'])).max(5).default(['quote']),
  catalogo: z
    .array(
      z.object({
        id,
        tipo: z.enum(['producto', 'servicio']),
        nombre: z.string().trim().min(1).max(160),
        precioCents: cents.positive(),
        minimoCents: cents.nullish(),
      }),
    )
    .max(200),
  limites: z.object({ descuentoMaxPct: z.number().min(0).max(DESCUENTO_MAX_TOPE), rondasMax: z.number().int().min(1).max(RONDAS_MAX_TOPE) }),
  rotarClave: z.boolean().optional(),
})

export const AbrirBody = z.object({
  compradorNodoId: id,
  vendedorNodoId: id,
  referencia: z.string().trim().max(120).nullish(),
  texto: z.string().trim().min(1).max(2000),
  lineas: z.array(z.object({ itemId: id, cantidad: z.number().int().min(1).max(MAX_CANTIDAD) })).min(1).max(MAX_LINEAS),
  presupuestoMaxCents: cents.positive(),
})

const cuerpo = async (req: Request) => req.json().catch(() => null)
const clave = (req: Request) => req.headers.get(CABECERA_CLAVE_NODO)

/** POST /api/v1/red/nodos: alta (201 + clave una vez) o actualización (200, exige clave). */
export async function manejarAltaNodo(req: Request, store: RedStore): Promise<Response> {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const p = NodoBody.safeParse(await cuerpo(req))
  if (!p.success) return json({ error: errores(p.error) }, 400)
  const r = await registrarNodo(p.data, clave(req), store)
  if (r.tipo === 'invalido') return json({ error: r.error }, 400)
  if (r.tipo === 'no-autorizado') return json({ error: 'el nodo ya existe: hace falta su clave (x-banda-nodo-clave)' }, 403)
  return json({ nodo: fichaPublica(r.nodo), ...(r.clave ? { clave: r.clave } : {}) }, r.tipo === 'creado' ? 201 : 200)
}

/** GET /api/v1/red/nodos?capacidad=quote&sector=…&limite=…: descubrimiento. */
export async function manejarBuscarNodos(req: Request, store: RedStore): Promise<Response> {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const u = new URL(req.url)
  const limite = Math.min(Math.max(Number(u.searchParams.get('limite')) || 50, 1), 100)
  const nodos = await store.buscarNodos({ capacidad: u.searchParams.get('capacidad') ?? undefined, sector: u.searchParams.get('sector') ?? undefined, limite })
  return json({ nodos: nodos.map(fichaPublica) })
}

/** DELETE /api/v1/red/nodos/:id: baja (exige la clave del nodo). */
export async function manejarBajaNodo(req: Request, nodoId: string, store: RedStore): Promise<Response> {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const r = await bajaNodo(nodoId, clave(req), store)
  if (r === 'no-encontrado') return json({ error: 'not found' }, 404)
  if (r === 'no-autorizado') return json({ error: 'forbidden' }, 403)
  return json({ ok: true })
}

export interface DepsAbrirApi extends DepsAbrir {
  lanzar: (sessionId: string) => void
}

/** POST /api/v1/negociacion: el COMPRADOR abre (con su clave). 202 con el estado. */
export async function manejarAbrir(req: Request, deps: DepsAbrirApi): Promise<Response> {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const p = AbrirBody.safeParse(await cuerpo(req))
  if (!p.success) return json({ error: errores(p.error) }, 400)
  const r = await abrirNegociacion({ ...p.data, referencia: p.data.referencia ?? null }, clave(req), deps)
  switch (r.tipo) {
    case 'no-autorizado':
      return json({ error: 'forbidden: clave del nodo comprador inválida o nodo inactivo' }, 403)
    case 'no-disponible':
      return json({ error: r.error }, 404)
    case 'invalido':
      return json({ error: r.error }, 400)
    case 'rate-limited':
      return json({ error: 'rate-limited', limit: r.limite }, 429)
    case 'sin-modelos':
      return json({ error: 'negociación sin modelo disponible (falta ZAI_API_KEY)' }, 503)
    case 'mesa':
      deps.lanzar(r.sessionId)
      return json(salidaNegociacion(r.negociacion), 202)
    case 'cerrada':
      return json(salidaNegociacion(r.negociacion), 202)
  }
}

/** GET /api/v1/negociacion/:id: estado, historial y propuesta (solo las dos partes). */
export async function manejarGet(req: Request, negId: string, store: RedStore): Promise<Response> {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const n = await store.negociacion(negId)
  if (!n) return json({ error: 'not found' }, 404)
  const parte = await parteDe(store, n, req.headers.get(CABECERA_NODO) ?? '', clave(req))
  if (!parte) return json({ error: 'forbidden' }, 403)
  return json({ ...salidaNegociacion(n), tuParte: parte })
}

/** POST /api/v1/negociacion/:id/aprobar | /rechazar: la persona de cada parte decide. */
export async function manejarDecision(req: Request, negId: string, decision: 'aprobar' | 'rechazar', deps: { store: RedStore; aviso?: DepsAvisoNeg }): Promise<Response> {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const r = await decidir(negId, req.headers.get(CABECERA_NODO) ?? '', clave(req), decision, deps)
  if (r.tipo === 'no-encontrada') return json({ error: 'not found' }, 404)
  if (r.tipo === 'no-autorizado') return json({ error: 'forbidden' }, 403)
  if (r.tipo === 'conflicto') return json({ error: r.error }, 409)
  return json(salidaNegociacion(r.negociacion))
}
