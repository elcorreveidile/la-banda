/**
 * Qué ve cada cual de una negociación (puro).
 *
 * - `salidaNegociacion`: contrato público (GET y webhook). Lo ven las DOS partes, así que
 *   NUNCA lleva límites privados: ni el presupuesto máximo del comprador ni los mínimos,
 *   el descuento máximo o las rondas del vendedor.
 * - `vistaVendedor` / `vistaComprador`: lo que lee cada mesa. Cada una ve SUS límites y
 *   nada de los de la otra. Los mensajes de la otra parte van delimitados como dato que no
 *   es de fiar (nunca instrucciones).
 */

import type { Negociacion, Oferta } from '@/db/negociacion'
import { delimitar } from '@/lib/firewall/patron'
import { rondasUsadas, suelo, totalLista } from './reglas'

export interface SalidaNegociacion {
  id: string
  referencia: string | null
  compradorNodoId: string
  vendedorNodoId: string
  estado: Negociacion['estado']
  motivo: string | null
  solicitud: { texto: string; lineas: { itemId: string; nombre: string; tipo: string; cantidad: number; precioListaCents: number }[]; totalListaCents: number }
  historial: Oferta[]
  propuesta: Negociacion['propuesta']
  aprobaciones: { comprador: string | null; vendedor: string | null }
  rechazadaPor: Negociacion['rechazadaPor']
  moneda: 'EUR'
  createdAt: string
  updatedAt: string
  cerradaAt: string | null
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

export function salidaNegociacion(n: Negociacion): SalidaNegociacion {
  return {
    id: n.id,
    referencia: n.referencia,
    compradorNodoId: n.compradorNodoId,
    vendedorNodoId: n.vendedorNodoId,
    estado: n.estado,
    motivo: n.motivo,
    solicitud: {
      texto: n.texto,
      lineas: n.lineas.map((l) => {
        const item = n.vendedor.items.find((i) => i.id === l.itemId)
        return { itemId: l.itemId, nombre: item?.nombre ?? l.itemId, tipo: item?.tipo ?? 'producto', cantidad: l.cantidad, precioListaCents: item?.precioCents ?? 0 }
      }),
      totalListaCents: totalLista(n.lineas, n.vendedor),
    },
    historial: n.ofertas,
    propuesta: n.propuesta,
    aprobaciones: { comprador: iso(n.aprobadaCompradorAt), vendedor: iso(n.aprobadaVendedorAt) },
    rechazadaPor: n.rechazadaPor,
    moneda: 'EUR',
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    cerradaAt: iso(n.cerradaAt),
  }
}

const historialPara = (ofertas: Oferta[], parte: 'comprador' | 'vendedor') =>
  ofertas.map((o) => ({
    ronda: o.ronda,
    de: o.de,
    tipo: o.tipo,
    totalCents: o.totalCents,
    lineas: o.lineas,
    // El mensaje de la OTRA parte es dato que no es de fiar; el propio se muestra tal cual.
    mensaje: o.de === parte ? o.mensaje : delimitar(`mensaje del ${o.de}`, o.mensaje),
  }))

export function vistaVendedor(n: Negociacion) {
  const rondasMax = n.vendedor.limites.rondasMax
  return {
    tuPapel: 'VENDEDOR',
    solicitudDelComprador: delimitar('solicitud del comprador', n.texto),
    lineas: n.lineas.map((l) => {
      const item = n.vendedor.items.find((i) => i.id === l.itemId)!
      return { itemId: l.itemId, nombre: item.nombre, tipo: item.tipo, cantidad: l.cantidad, precioListaCents: item.precioCents, tuMinimoPorUnidadCents: suelo(item, n.vendedor.limites) }
    }),
    tusLimites: { descuentoMaxPct: n.vendedor.limites.descuentoMaxPct, rondasMax, rondasUsadas: rondasUsadas(n.ofertas) },
    turno: n.turno,
    historial: historialPara(n.ofertas, 'vendedor'),
  }
}

export function vistaComprador(n: Negociacion) {
  return {
    tuPapel: 'COMPRADOR',
    tuSolicitud: n.texto,
    lineas: n.lineas.map((l) => {
      const item = n.vendedor.items.find((i) => i.id === l.itemId)!
      return { itemId: l.itemId, nombre: item.nombre, tipo: item.tipo, cantidad: l.cantidad, precioListaCents: item.precioCents }
    }),
    totalListaCents: totalLista(n.lineas, n.vendedor),
    tusLimites: { presupuestoMaxCents: n.presupuestoMaxCents },
    turno: n.turno,
    historial: historialPara(n.ofertas, 'comprador'),
  }
}
