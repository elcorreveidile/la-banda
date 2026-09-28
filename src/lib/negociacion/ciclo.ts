/**
 * Ciclo de la red de webs (Fase 4a): nodos y negociaciones.
 *
 * Todo lo que decide dinero o estado lo decide el CÓDIGO:
 * - las mesas (vendedor y comprador) solo pueden mover con `ofertar` / `responder`, que
 *   validan contra los límites de SU dueño (`reglas.ts`) y rechazan lo que se sale;
 * - el árbitro llama a `comprobar`, que dice quién mueve o cómo acaba según el estado de la
 *   fila (no según lo que opine un modelo);
 * - la propuesta final la compone el código desde la oferta aceptada (`propuestaDe`);
 * - un mensaje con inyección veta la negociación, diga lo que diga el cierre de la mesa;
 * - NINGÚN acuerdo es firme sin la aprobación humana de las dos partes (`aprobar`).
 * Sin transacciones (neon-http): fila a fila.
 */

import type { LimitesVendedor, ItemCatalogo, Negociacion, Nodo, Parte, LineaSolicitud } from '@/db/negociacion'
import { inicioDiaUtc } from '@/lib/firewall/config'
import { MESA_MAX_MS, PROPUESTA_TTL_MS, maxPorNodoDia } from './config'
import { claveValida, hashClave, nuevaClaveNodo } from './nodoAuth'
import {
  DESCUENTO_MAX_TOPE,
  RONDAS_MAX_TOPE,
  detectarInyeccion,
  hayZonaDeAcuerdo,
  itemsDeSolicitud,
  limpiarMensaje,
  propuestaDe,
  rondasUsadas,
  validarOfertaVendedor,
  validarRespuestaComprador,
} from './reglas'
import type { RedStore } from './store'
import { agotadoAviso, avisoNegConfigurado, intentarAvisoNeg, venceAviso, type DepsAvisoNeg } from './webhook'

const uuid = () => crypto.randomUUID()

/* ================================ NODOS ================================ */

export interface AltaNodo {
  tenantId: string
  host: string
  nombre: string
  sector: string
  capacidades: string[]
  catalogo: ItemCatalogo[]
  limites: LimitesVendedor
  rotarClave?: boolean
}

export type ResultadoAlta =
  | { tipo: 'creado' | 'actualizado'; nodo: Nodo; clave?: string }
  | { tipo: 'no-autorizado' }
  | { tipo: 'invalido'; error: string }

/** Sanea el catálogo y los límites (el código es la autoridad; nada sale de sus topes). */
export function sanearAlta(a: AltaNodo): { ok: true; catalogo: ItemCatalogo[]; limites: LimitesVendedor } | { ok: false; error: string } {
  const ids = new Set<string>()
  const catalogo: ItemCatalogo[] = []
  for (const i of a.catalogo) {
    if (ids.has(i.id)) return { ok: false, error: `item repetido: ${i.id}` }
    ids.add(i.id)
    if (!Number.isInteger(i.precioCents) || i.precioCents <= 0) return { ok: false, error: `precio inválido en ${i.id}` }
    const min = i.minimoCents ?? null
    if (min !== null && (!Number.isInteger(min) || min < 0 || min > i.precioCents)) return { ok: false, error: `mínimo inválido en ${i.id} (entre 0 y el precio)` }
    catalogo.push({ id: i.id, tipo: i.tipo, nombre: i.nombre, precioCents: i.precioCents, minimoCents: min })
  }
  const d = a.limites.descuentoMaxPct
  const r = a.limites.rondasMax
  if (!Number.isFinite(d) || d < 0 || d > DESCUENTO_MAX_TOPE) return { ok: false, error: `descuentoMaxPct entre 0 y ${DESCUENTO_MAX_TOPE}` }
  if (!Number.isInteger(r) || r < 1 || r > RONDAS_MAX_TOPE) return { ok: false, error: `rondasMax entre 1 y ${RONDAS_MAX_TOPE}` }
  return { ok: true, catalogo, limites: { descuentoMaxPct: d, rondasMax: r } }
}

/**
 * Alta o actualización del nodo de un tenant. Alta: entrega la clave del nodo UNA vez.
 * Actualización (y reactivación): exige la clave vigente; `rotarClave` entrega una nueva.
 */
export async function registrarNodo(a: AltaNodo, clave: string | null, store: RedStore, now = Date.now()): Promise<ResultadoAlta> {
  const s = sanearAlta(a)
  if (!s.ok) return { tipo: 'invalido', error: s.error }
  const datos = { host: a.host, nombre: a.nombre, sector: a.sector, capacidades: [...new Set(a.capacidades)], catalogo: s.catalogo, limites: s.limites, activo: true }
  const previo = await store.nodoPorTenant(a.tenantId)
  if (previo) {
    if (!claveValida(clave, previo.claveHash)) return { tipo: 'no-autorizado' }
    const nueva = a.rotarClave ? nuevaClaveNodo() : undefined
    await store.actualizarNodo(previo.id, { ...datos, ...(nueva ? { claveHash: hashClave(nueva) } : {}) })
    return { tipo: 'actualizado', nodo: (await store.nodo(previo.id))!, clave: nueva }
  }
  const nueva = nuevaClaveNodo()
  const nodo = await store.insertarNodo({ id: uuid(), tenantId: a.tenantId, ...datos, claveHash: hashClave(nueva), createdAt: new Date(now), updatedAt: new Date(now) })
  return { tipo: 'creado', nodo, clave: nueva }
}

/** Baja: el nodo deja de aparecer y de poder negociar (las negociaciones abiertas siguen su curso). */
export async function bajaNodo(id: string, clave: string | null, store: RedStore): Promise<'ok' | 'no-autorizado' | 'no-encontrado'> {
  const n = await store.nodo(id)
  if (!n) return 'no-encontrado'
  if (!claveValida(clave, n.claveHash)) return 'no-autorizado'
  await store.actualizarNodo(id, { activo: false })
  return 'ok'
}

/** Ficha pública de un nodo (descubrimiento): sin mínimos ni límites. */
export function fichaPublica(n: Nodo) {
  return {
    id: n.id,
    nombre: n.nombre,
    host: n.host,
    sector: n.sector,
    capacidades: n.capacidades,
    catalogo: n.catalogo.map((i) => ({ id: i.id, tipo: i.tipo, nombre: i.nombre, precioCents: i.precioCents })),
    moneda: 'EUR' as const,
  }
}

/* ============================ NEGOCIACIONES ============================ */

export interface Apertura {
  compradorNodoId: string
  vendedorNodoId: string
  referencia: string | null
  texto: string
  lineas: LineaSolicitud[]
  presupuestoMaxCents: number
}

export interface DepsAbrir {
  store: RedStore
  /** Abre la sesión del dominio negociacion y devuelve su id (no lanza ticks). */
  abrirMesa: (n: Negociacion) => Promise<string>
  modelosOk?: () => boolean
  now?: () => number
  aviso?: DepsAvisoNeg
}

export type ResultadoApertura =
  | { tipo: 'mesa'; negociacion: Negociacion; sessionId: string }
  | { tipo: 'cerrada'; negociacion: Negociacion }
  | { tipo: 'no-autorizado' }
  | { tipo: 'no-disponible'; error: string }
  | { tipo: 'invalido'; error: string }
  | { tipo: 'rate-limited'; limite: number }
  | { tipo: 'sin-modelos' }

const avisoInicial = (env?: Record<string, string | undefined>) => (avisoNegConfigurado(env) ? ('pendiente' as const) : ('no_aplica' as const))

async function avisarSiToca(store: RedStore, id: string, aviso?: DepsAvisoNeg): Promise<void> {
  const n = await store.negociacion(id)
  if (n && n.avisoEstado === 'pendiente' && n.avisoIntentos === 0) await intentarAvisoNeg(store, n, aviso)
}

/** Nuevo estado + aviso (los reintentos empiezan de cero con cada cambio). */
async function cambiarEstado(store: RedStore, id: string, patch: Partial<Negociacion>, aviso?: DepsAvisoNeg): Promise<Negociacion> {
  await store.actualizarNegociacion(id, { ...patch, avisoEstado: avisoInicial(aviso?.env), avisoIntentos: 0, avisoUltimoError: null })
  await avisarSiToca(store, id, aviso)
  return (await store.negociacion(id))!
}

export async function abrirNegociacion(a: Apertura, clave: string | null, deps: DepsAbrir): Promise<ResultadoApertura> {
  const { store } = deps
  const now = (deps.now ?? Date.now)()
  const comprador = await store.nodo(a.compradorNodoId)
  if (!comprador || !comprador.activo || !claveValida(clave, comprador.claveHash)) return { tipo: 'no-autorizado' }
  const vendedor = await store.nodo(a.vendedorNodoId)
  if (!vendedor || !vendedor.activo || !vendedor.capacidades.includes('quote')) return { tipo: 'no-disponible', error: 'el vendedor no está en la red o no acepta solicitudes de presupuesto' }
  if (vendedor.id === comprador.id) return { tipo: 'invalido', error: 'un nodo no puede negociar consigo mismo' }
  if (!Number.isInteger(a.presupuestoMaxCents) || a.presupuestoMaxCents <= 0) return { tipo: 'invalido', error: 'presupuestoMaxCents: céntimos enteros mayores que 0' }
  const items = itemsDeSolicitud(a.lineas, vendedor.catalogo)
  if (!items.ok) return { tipo: 'invalido', error: items.error }

  const limite = maxPorNodoDia()
  if ((await store.negociacionesDesde(comprador.id, inicioDiaUtc(now))) >= limite) return { tipo: 'rate-limited', limite }

  const snapshot = { items: items.valor, limites: vendedor.limites }
  const base = {
    id: uuid(),
    compradorNodoId: comprador.id,
    vendedorNodoId: vendedor.id,
    referencia: a.referencia,
    texto: a.texto,
    lineas: a.lineas.map((l) => ({ itemId: l.itemId, cantidad: l.cantidad })),
    presupuestoMaxCents: a.presupuestoMaxCents,
    vendedor: snapshot,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  }

  // Determinista primero: la solicitud pasa el carril rápido ANTES de que la lea ningún modelo.
  const inyeccion = detectarInyeccion(a.texto)
  if (inyeccion) {
    const n = await store.insertarNegociacion({ ...base, estado: 'negociando' })
    return { tipo: 'cerrada', negociacion: await cambiarEstado(store, n.id, { estado: 'vetada', inyeccionDe: 'comprador', motivo: `la solicitud intenta manipular al agente del vendedor (${inyeccion})`, cerradaAt: new Date(now) }, deps.aviso) }
  }
  // Sin zona de acuerdo no se gasta ni una llamada a un modelo (y no se revela el mínimo).
  if (!hayZonaDeAcuerdo(base.lineas, snapshot, a.presupuestoMaxCents)) {
    const n = await store.insertarNegociacion({ ...base, estado: 'negociando' })
    return { tipo: 'cerrada', negociacion: await cambiarEstado(store, n.id, { estado: 'sin_acuerdo', desenlace: 'sin_acuerdo', motivo: 'el presupuesto no alcanza lo mínimo que acepta el vendedor', cerradaAt: new Date(now) }, deps.aviso) }
  }
  if (deps.modelosOk && !deps.modelosOk()) return { tipo: 'sin-modelos' }

  const n = await store.insertarNegociacion({ ...base, estado: 'negociando', turno: 'vendedor' })
  try {
    const sessionId = await deps.abrirMesa(n)
    await store.actualizarNegociacion(n.id, { sessionId })
    return { tipo: 'mesa', negociacion: { ...n, sessionId }, sessionId }
  } catch (err) {
    await cambiarEstado(store, n.id, { estado: 'fallida', motivo: 'no se pudo abrir la mesa', cerradaAt: new Date(now) }, deps.aviso)
    throw err
  }
}

/* ------------------------- movimientos de las mesas ------------------------- */

async function enCurso(store: RedStore, sessionId: string): Promise<Negociacion | { error: string }> {
  const n = await store.negociacionPorSesion(sessionId)
  if (!n) return { error: 'negociación no encontrada para esta mesa' }
  if (n.estado !== 'negociando') return { error: `la negociación ya no está abierta (${n.estado})` }
  return n
}

/** Carril rápido de un mensaje entre nodos: si intenta manipular a la otra parte, veto. */
async function mensajeSeguro(store: RedStore, n: Negociacion, de: Parte, mensaje: string): Promise<string | null> {
  const m = detectarInyeccion(mensaje)
  if (!m) return null
  await store.actualizarNegociacion(n.id, { inyeccionDe: de, desenlace: 'vetada', motivo: `el mensaje del ${de} intenta manipular al agente contrario (${m})` })
  return `mensaje rechazado: intenta manipular al agente contrario (${m}). La negociación queda vetada.`
}

export async function ofertar(store: RedStore, sessionId: string, input: { precios: { itemId: string; precioUnitCents: number }[]; mensaje?: unknown }, now = Date.now()) {
  const n = await enCurso(store, sessionId)
  if ('error' in n) return n
  if (n.turno !== 'vendedor') return { error: `no es tu turno (turno: ${n.turno})` }
  const mensaje = limpiarMensaje(input.mensaje)
  const bloqueo = await mensajeSeguro(store, n, 'vendedor', mensaje)
  if (bloqueo) return { error: bloqueo }
  const v = validarOfertaVendedor(Array.isArray(input.precios) ? input.precios : [], n)
  if (!v.ok) {
    await store.actualizarNegociacion(n.id, { intentosFueraDeLimite: n.intentosFueraDeLimite + 1 })
    return { error: `oferta rechazada por el código: ${v.error}. Corrígela dentro de tus límites.` }
  }
  const oferta = { ronda: v.valor.ronda, de: 'vendedor' as const, tipo: 'oferta' as const, lineas: v.valor.lineas, totalCents: v.valor.totalCents, mensaje, at: new Date(now).toISOString() }
  await store.actualizarNegociacion(n.id, { ofertas: [...n.ofertas, oferta], turno: 'comprador' })
  return { ok: true, oferta }
}

export async function responder(
  store: RedStore,
  sessionId: string,
  input: { tipo: 'aceptacion' | 'contraoferta' | 'rechazo'; totalCents?: number; mensaje?: unknown },
  now = Date.now(),
) {
  const n = await enCurso(store, sessionId)
  if ('error' in n) return n
  if (n.turno !== 'comprador') return { error: `no es tu turno (turno: ${n.turno})` }
  const mensaje = limpiarMensaje(input.mensaje)
  const bloqueo = await mensajeSeguro(store, n, 'comprador', mensaje)
  if (bloqueo) return { error: bloqueo }
  if (input.tipo === 'rechazo') {
    await store.actualizarNegociacion(n.id, { turno: 'sin_acuerdo', motivo: 'el comprador no acepta las condiciones' })
    return { ok: true, fin: 'sin_acuerdo' }
  }
  const r = validarRespuestaComprador(input.tipo === 'aceptacion' ? { tipo: 'aceptacion' } : { tipo: 'contraoferta', totalCents: Number(input.totalCents) }, n)
  if (!r.ok) {
    await store.actualizarNegociacion(n.id, { intentosFueraDeLimite: n.intentosFueraDeLimite + 1 })
    return { error: `respuesta rechazada por el código: ${r.error}` }
  }
  const mov = { ronda: r.valor.ronda, de: 'comprador' as const, tipo: r.valor.tipo, lineas: r.valor.lineas, totalCents: r.valor.totalCents, mensaje, at: new Date(now).toISOString() }
  await store.actualizarNegociacion(n.id, { ofertas: [...n.ofertas, mov], turno: r.valor.tipo === 'aceptacion' ? 'cerrar' : 'vendedor' })
  return { ok: true, movimiento: mov }
}

export type Siguiente = { resultado: 'seguir'; siguiente: 'Berlín' | 'Lisboa' } | { resultado: 'propuesta'; siguiente: 'Helsinki' } | { resultado: 'sin_acuerdo' | 'vetar'; siguiente: 'Palermo'; motivo: string }

/** Árbitro determinista: quién mueve ahora o cómo acaba (y lo deja fijado en la fila). */
export async function comprobar(store: RedStore, sessionId: string): Promise<Siguiente | { error: string }> {
  const n = await enCurso(store, sessionId)
  if ('error' in n) return n
  const fin = async (resultado: 'sin_acuerdo' | 'vetar', motivo: string): Promise<Siguiente> => {
    await store.actualizarNegociacion(n.id, { desenlace: resultado === 'vetar' ? 'vetada' : 'sin_acuerdo', motivo })
    return { resultado, siguiente: 'Palermo', motivo }
  }
  if (n.inyeccionDe || n.desenlace === 'vetada') return fin('vetar', n.motivo ?? 'mensaje con inyección')
  if (n.turno === 'sin_acuerdo') return fin('sin_acuerdo', n.motivo ?? 'el comprador no acepta las condiciones')
  const nuevo = n.ofertas.length > n.ofertasVistas
  await store.actualizarNegociacion(n.id, { ofertasVistas: n.ofertas.length })
  if (!nuevo) {
    // La parte a la que le tocaba no hizo un movimiento válido (p. ej. insistió por debajo de su mínimo).
    if (n.turno === 'comprador' && rondasUsadas(n.ofertas) >= n.vendedor.limites.rondasMax) return fin('sin_acuerdo', 'se agotaron las rondas sin acuerdo')
    return fin('vetar', `el ${n.turno} no hizo un movimiento válido dentro de sus límites`)
  }
  if (n.turno === 'cerrar') return { resultado: 'propuesta', siguiente: 'Helsinki' }
  if (n.turno === 'comprador') return { resultado: 'seguir', siguiente: 'Lisboa' }
  return { resultado: 'seguir', siguiente: 'Berlín' }
}

/** Helsinki: el CÓDIGO compone la propuesta desde la oferta aceptada (el agente no pone importes). */
export async function registrarPropuesta(store: RedStore, sessionId: string) {
  const n = await enCurso(store, sessionId)
  if ('error' in n) return n
  const p = propuestaDe(n)
  if (!p.ok) {
    await store.actualizarNegociacion(n.id, { desenlace: 'vetada', motivo: p.error })
    return { error: p.error }
  }
  await store.actualizarNegociacion(n.id, { propuesta: p.valor, desenlace: 'propuesta' })
  return { ok: true, propuesta: p.valor }
}

/* ------------------------------- cierre ------------------------------- */

export interface DepsCierre {
  store: RedStore
  sesion: (id: string) => Promise<{ status: 'open' | 'closed' | 'vetoed' | 'failed' } | null>
  now?: () => number
  aviso?: DepsAvisoNeg
}

/** Aplica el desenlace cuando la mesa termina. Idempotente: una fila cerrada no se toca. */
export async function finalizarNegociacion(n: Negociacion, deps: DepsCierre): Promise<Negociacion | null> {
  if (n.estado !== 'negociando' || !n.sessionId) return null
  const s = await deps.sesion(n.sessionId)
  if (!s || s.status === 'open') return null
  const now = new Date((deps.now ?? Date.now)())
  let patch: Partial<Negociacion>
  if (n.inyeccionDe) patch = { estado: 'vetada', motivo: n.motivo ?? `inyección del ${n.inyeccionDe}` }
  else if (n.desenlace === 'propuesta' && s.status === 'closed') {
    // Doble control al cierre: la propuesta guardada vuelve a pasar los límites.
    const p = propuestaDe(n)
    patch = p.ok && p.valor.totalCents === n.propuesta?.totalCents ? { estado: 'propuesta', motivo: null } : { estado: 'vetada', motivo: p.ok ? 'la propuesta guardada no cuadra' : p.error }
  } else if (n.desenlace === 'sin_acuerdo') patch = { estado: 'sin_acuerdo' }
  else if (n.desenlace === 'vetada' || s.status === 'vetoed') patch = { estado: 'vetada', motivo: n.motivo ?? 'vetada por el cortafuegos' }
  else patch = { estado: 'fallida', motivo: 'la mesa no llegó a término' }
  return cambiarEstado(deps.store, n.id, { ...patch, cerradaAt: now }, deps.aviso)
}

export async function finalizarNegociacionDeSesion(sessionId: string, deps: DepsCierre): Promise<Negociacion | null> {
  const n = await deps.store.negociacionPorSesion(sessionId)
  return n ? finalizarNegociacion(n, deps) : null
}

/* -------------------------- aprobación humana -------------------------- */

export type ResultadoDecision = { tipo: 'ok'; negociacion: Negociacion } | { tipo: 'no-autorizado' } | { tipo: 'no-encontrada' } | { tipo: 'conflicto'; error: string }

/** ¿Qué parte es el nodo que llama, con su clave? */
export async function parteDe(store: RedStore, n: Negociacion, nodoId: string, clave: string | null): Promise<Parte | null> {
  const parte: Parte | null = nodoId === n.compradorNodoId ? 'comprador' : nodoId === n.vendedorNodoId ? 'vendedor' : null
  if (!parte) return null
  const nodo = await store.nodo(nodoId)
  return nodo && claveValida(clave, nodo.claveHash) ? parte : null
}

const caducada = (n: Negociacion, now: number) => n.cerradaAt !== null && now - n.cerradaAt.getTime() > PROPUESTA_TTL_MS

export async function decidir(
  id: string,
  nodoId: string,
  clave: string | null,
  decision: 'aprobar' | 'rechazar',
  deps: { store: RedStore; now?: () => number; aviso?: DepsAvisoNeg },
): Promise<ResultadoDecision> {
  const { store } = deps
  const now = (deps.now ?? Date.now)()
  const n = await store.negociacion(id)
  if (!n) return { tipo: 'no-encontrada' }
  const parte = await parteDe(store, n, nodoId, clave)
  if (!parte) return { tipo: 'no-autorizado' }
  if (n.estado === 'acordada' && decision === 'aprobar') return { tipo: 'ok', negociacion: n }
  if (n.estado !== 'propuesta') return { tipo: 'conflicto', error: `la negociación está «${n.estado}»: no hay propuesta pendiente` }
  if (caducada(n, now)) return { tipo: 'ok', negociacion: await cambiarEstado(store, id, { estado: 'sin_acuerdo', motivo: 'la propuesta caducó sin la aprobación de las dos partes' }, deps.aviso) }
  if (decision === 'rechazar') return { tipo: 'ok', negociacion: await cambiarEstado(store, id, { estado: 'rechazada', rechazadaPor: parte }, deps.aviso) }
  const campo = parte === 'comprador' ? 'aprobadaCompradorAt' : 'aprobadaVendedorAt'
  if (n[campo]) return { tipo: 'ok', negociacion: n }
  const at = new Date(now)
  const ambas = parte === 'comprador' ? Boolean(n.aprobadaVendedorAt) : Boolean(n.aprobadaCompradorAt)
  return { tipo: 'ok', negociacion: await cambiarEstado(store, id, { [campo]: at, ...(ambas ? { estado: 'acordada' as const } : {}) }, deps.aviso) }
}

/* -------------------------------- cron -------------------------------- */

export interface ResultadoCicloRed {
  cerradas: string[]
  abandonadas: string[]
  caducadas: string[]
  avisadas: string[]
  agotadas: string[]
}

export async function cicloRed(deps: DepsCierre & { abandonar: (sessionId: string) => Promise<void> }): Promise<ResultadoCicloRed> {
  const { store } = deps
  const now = (deps.now ?? Date.now)()
  const r: ResultadoCicloRed = { cerradas: [], abandonadas: [], caducadas: [], avisadas: [], agotadas: [] }
  for (const n of await store.negociacionesAbiertas()) {
    if (now - n.createdAt.getTime() > MESA_MAX_MS && n.sessionId) {
      const s = await deps.sesion(n.sessionId)
      if (s?.status === 'open') {
        await deps.abandonar(n.sessionId)
        r.abandonadas.push(n.id)
      }
    }
    const fin = await finalizarNegociacion(n, deps)
    if (fin) r.cerradas.push(fin.id)
  }
  r.caducadas = await caducarPropuestas(store, await store.propuestasPendientes(), now, deps.aviso)
  for (const n of await store.avisosPendientes()) {
    if (agotadoAviso(n, now)) {
      await store.actualizarNegociacion(n.id, { avisoEstado: 'agotado' })
      r.agotadas.push(n.id)
      continue
    }
    if (!venceAviso(n, now)) continue
    const res = await intentarAvisoNeg(store, n, { ...deps.aviso, now: () => now })
    if (res.ok) r.avisadas.push(n.id)
  }
  return r
}

/** Propuestas que nadie aprobó a tiempo (para el cron, con el store completo). */
export async function caducarPropuestas(store: RedStore, propuestas: Negociacion[], now: number, aviso?: DepsAvisoNeg): Promise<string[]> {
  const ids: string[] = []
  for (const n of propuestas) {
    if (n.estado === 'propuesta' && caducada(n, now)) {
      await cambiarEstado(store, n.id, { estado: 'sin_acuerdo', motivo: 'la propuesta caducó sin la aprobación de las dos partes' }, aviso)
      ids.push(n.id)
    }
  }
  return ids
}
