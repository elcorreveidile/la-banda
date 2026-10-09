import { pgTable, text, timestamp, numeric, integer, primaryKey, index } from 'drizzle-orm/pg-core'

/* ------------------------------------------------------------------ */
/* Dominio trading (brief §3): portfolio, orders_sim, prices           */
/* ------------------------------------------------------------------ */

/** Velas horarias normalizadas. Una fila por símbolo y hora de apertura. */
export const prices = pgTable(
  'prices',
  {
    symbol: text('symbol').notNull(),
    /** Apertura de la vela (UTC). */
    ts: timestamp('ts', { withTimezone: true }).notNull(),
    open: numeric('open', { precision: 18, scale: 8 }).notNull(),
    high: numeric('high', { precision: 18, scale: 8 }).notNull(),
    low: numeric('low', { precision: 18, scale: 8 }).notNull(),
    close: numeric('close', { precision: 18, scale: 8 }).notNull(),
    volume: numeric('volume', { precision: 24, scale: 8 }).notNull(),
    source: text('source').notNull(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.ts] })],
)

/** Cartera ficticia. Una sola fila (`id = 'main'`), 100 USD iniciales. */
export const portfolio = pgTable('portfolio', {
  id: text('id').primaryKey(),
  initialUsd: numeric('initial_usd', { precision: 18, scale: 8 }).notNull(),
  cashUsd: numeric('cash_usd', { precision: 18, scale: 8 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Cartera REAL del usuario (no la simulada): sus tenencias de cripto para seguir valor y variación.
 * Una fila por (owner, symbol). `refPriceUsd` es el cierre USD al registrar la tenencia = base de la
 * variación (no es precio de compra: «partimos de lo que tenemos»). El valor en € se estima en lectura.
 */
export const cryptoCartera = pgTable(
  'crypto_cartera',
  {
    owner: text('owner').notNull(),
    symbol: text('symbol').notNull(),
    unidades: numeric('unidades', { precision: 24, scale: 12 }).notNull(),
    refPriceUsd: numeric('ref_price_usd', { precision: 18, scale: 8 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.owner, t.symbol] })],
)

/**
 * Historial diario del valor de «Mi cartera» (una fila por owner y día UTC). Lo escribe el cron diario
 * (y al guardar una tenencia) con el valor en € calculado; sirve para el mini-gráfico de evolución.
 */
export const cryptoCarteraHistorial = pgTable(
  'crypto_cartera_historial',
  {
    owner: text('owner').notNull(),
    day: text('day').notNull(), // 'YYYY-MM-DD' (UTC)
    valorEur: numeric('valor_eur', { precision: 18, scale: 2 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.owner, t.day] })],
)

export type OrderStatus = 'open' | 'closed' | 'rejected'
export type OrderSide = 'buy'
export type ExitReason = 'stop' | 'target' | 'manual' | 'expired'

/** Órdenes simuladas (libro de Helsinki). Solo largos al contado. */
export const ordersSim = pgTable(
  'orders_sim',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    symbol: text('symbol').notNull(),
    side: text('side').$type<OrderSide>().notNull().default('buy'),
    /** Importe en USD solicitado por Estocolmo (antes de comisión). */
    sizeUsd: numeric('size_usd', { precision: 18, scale: 8 }).notNull(),
    qty: numeric('qty', { precision: 24, scale: 12 }).notNull(),
    /** Precio efectivo de entrada (cierre + slippage). */
    entryPrice: numeric('entry_price', { precision: 18, scale: 8 }).notNull(),
    /** Cierre de la vela usado como referencia de entrada. */
    referencePrice: numeric('reference_price', { precision: 18, scale: 8 }).notNull(),
    feesUsd: numeric('fees_usd', { precision: 18, scale: 8 }).notNull(),
    stopPrice: numeric('stop_price', { precision: 18, scale: 8 }).notNull(),
    targetPrice: numeric('target_price', { precision: 18, scale: 8 }),
    /** Vela máxima de permanencia (0 = sin límite). */
    maxHoursOpen: integer('max_hours_open').notNull().default(0),
    conditions: text('conditions'),
    status: text('status').$type<OrderStatus>().notNull().default('open'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    exitPrice: numeric('exit_price', { precision: 18, scale: 8 }),
    exitReason: text('exit_reason').$type<ExitReason>(),
    pnlUsd: numeric('pnl_usd', { precision: 18, scale: 8 }),
    createdBy: text('created_by').notNull(),
  },
  (t) => [index('orders_sim_status').on(t.status), index('orders_sim_session').on(t.sessionId)],
)

export type Price = typeof prices.$inferSelect
export type Portfolio = typeof portfolio.$inferSelect
export type OrderSim = typeof ordersSim.$inferSelect
