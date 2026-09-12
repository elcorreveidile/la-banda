import type { ToolDef } from '../types'
import { db } from '@/db'
import { events, handoffs, tasks } from '@/db/schema'
import { asc, eq } from 'drizzle-orm'
import { codenameOf } from '@/engine/store'
import { loadCandles, openOrder, snapshot } from '@/lib/trading/portfolio'
import { SYMBOLS, volatility } from '@/lib/trading/sim'
import { webSearch } from '@/lib/webSearch'

const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def)

/** Herramientas del dominio trading. Cada agente solo ve las de su lista. */
export const tradingTools: Record<string, ToolDef> = {
  getCandles: {
    name: 'getCandles',
    description: `Velas horarias CERRADAS guardadas en base de datos, en orden cronológico. Símbolos: ${SYMBOLS.join(', ')}. Devuelve filas [isoHora, open, high, low, close, volumen] más estadísticas (último cierre, volumen medio, volatilidad horaria).`,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', enum: [...SYMBOLS] },
        limit: { type: 'integer', minimum: 5, maximum: 120, description: 'Número de velas (por defecto 48).' },
      },
      required: ['symbol'],
      additionalProperties: false,
    },
    run: async (input) => {
      const symbol = String(input.symbol)
      const candles = await loadCandles(symbol, num(input.limit, 48))
      if (!candles.length) return { symbol, error: 'sin velas guardadas' }
      const vols = candles.map((c) => c.volume)
      return {
        symbol,
        count: candles.length,
        lastClosedCandle: new Date(candles.at(-1)!.ts).toISOString(),
        lastClose: candles.at(-1)!.close,
        avgVolume: vols.reduce((a, b) => a + b, 0) / vols.length,
        hourlyVolatility: volatility(candles),
        rows: candles.map((c) => [new Date(c.ts).toISOString(), c.open, c.high, c.low, c.close, c.volume]),
      }
    },
  },

  getPortfolio: {
    name: 'getPortfolio',
    description: 'Cartera simulada: caja en USD, patrimonio y posiciones abiertas valoradas al último cierre.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => snapshot(),
  },

  now: {
    name: 'now',
    description: 'Fecha y hora actual en ISO 8601 (UTC).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => ({ now: new Date().toISOString() }),
  },

  webSearch: {
    name: 'webSearch',
    description: 'Búsqueda web (z.ai). Úsala como mucho 2 veces por ciclo, con consultas concretas (noticias de las últimas horas sobre BTC/ETH, eventos macro). Devuelve hasta 5 resultados con título, extracto, medio, fecha y enlace.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 3, maxLength: 200 },
        recency: { type: 'string', enum: ['oneDay', 'oneWeek', 'oneMonth'], description: 'Antigüedad máxima (por defecto oneDay).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    run: async (input) => webSearch(String(input.query), { recency: (input.recency as 'oneDay' | 'oneWeek' | 'oneMonth') ?? 'oneDay', count: 5 }),
  },

  writeLedger: {
    name: 'writeLedger',
    description: 'Registra y EJECUTA la orden simulada aprobada por Palermo: compra al último cierre con slippage 0,3 % y comisión 0,1 %. El código valida (caja, stop por debajo, objetivo por encima) y devuelve la orden registrada o el motivo del rechazo. Llámala una sola vez por orden.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', enum: [...SYMBOLS] },
        sizeUsd: { type: 'number', exclusiveMinimum: 0, description: 'Importe en USD (sin comisión).' },
        stopPrice: { type: 'number', exclusiveMinimum: 0, description: 'Nivel de invalidación (Río).' },
        targetPrice: { type: 'number', exclusiveMinimum: 0, description: 'Objetivo de salida (opcional).' },
        maxHoursOpen: { type: 'integer', minimum: 0, maximum: 168, description: 'Horas máximas abierta; 0 = sin límite (por defecto 24).' },
        conditions: { type: 'string', maxLength: 600, description: 'Condiciones exactas de entrada y salida (Berlín), en una frase.' },
      },
      required: ['symbol', 'sizeUsd', 'stopPrice'],
      additionalProperties: false,
    },
    run: async (input, ctx) => {
      const order = await openOrder({
        sessionId: ctx.sessionId,
        symbol: String(input.symbol),
        sizeUsd: num(input.sizeUsd, 0),
        stopPrice: num(input.stopPrice, 0),
        targetPrice: input.targetPrice == null ? null : num(input.targetPrice, 0),
        maxHoursOpen: num(input.maxHoursOpen, 24),
        conditions: input.conditions ? String(input.conditions) : null,
        createdBy: ctx.agentCodename,
      })
      return {
        id: order.id,
        status: order.status,
        symbol: order.symbol,
        sizeUsd: Number(order.sizeUsd),
        qty: Number(order.qty),
        entryPrice: Number(order.entryPrice),
        referencePrice: Number(order.referencePrice),
        feesUsd: Number(order.feesUsd),
        stopPrice: Number(order.stopPrice),
        targetPrice: order.targetPrice == null ? null : Number(order.targetPrice),
        maxHoursOpen: order.maxHoursOpen,
        note: order.conditions,
      }
    },
  },

  readAll: {
    name: 'readAll',
    description: 'La cadena completa de esta sesión: cada traspaso (de quién a quién, estado, motivo, carga) y cada evento en orden. Úsala una vez, al empezar.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_input, ctx) => {
      const hs = await db
        .select({ h: handoffs })
        .from(handoffs)
        .innerJoin(tasks, eq(handoffs.taskId, tasks.id))
        .where(eq(tasks.sessionId, ctx.sessionId))
        .orderBy(asc(handoffs.createdAt))
      const es = await db.select().from(events).where(eq(events.sessionId, ctx.sessionId)).orderBy(asc(events.id))
      return {
        handoffs: hs.map(({ h }) => ({
          at: h.createdAt.toISOString(),
          from: h.fromAgent ? codenameOf(h.fromAgent) : 'motor',
          to: codenameOf(h.toAgent),
          status: h.status,
          reason: h.reason,
          payload: h.payload,
        })),
        events: es.map((e) => ({ at: e.createdAt.toISOString(), who: e.agentId ? codenameOf(e.agentId) : 'motor', type: e.type, message: e.message })),
      }
    },
  },
}
