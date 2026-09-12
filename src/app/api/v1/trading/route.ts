import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { sessions } from '@/db/schema'
import { apiUnauthorized } from '@/lib/apiAuth'
import { tradingMetrics } from '@/lib/trading/metrics'
import { INITIAL_USD, FEE, SLIPPAGE, SYMBOLS } from '@/lib/trading/sim'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/trading → estado de la mesa simulada para mostrarlo en por2duros.com:
 * cartera, métricas, operaciones y últimas sesiones (con informe final).
 */
export async function GET(req: Request) {
  const denied = apiUnauthorized(req)
  if (denied) return denied
  const m = await tradingMetrics()
  const recent = await db.select().from(sessions).where(eq(sessions.domain, 'trading')).orderBy(desc(sessions.startedAt)).limit(24)
  return NextResponse.json({
    reglas: { capitalInicialUsd: INITIAL_USD, slippage: SLIPPAGE, comision: FEE, simbolos: SYMBOLS, velas: '1h', ciclo: 'cada hora' },
    cartera: m.portfolio,
    metricas: { sesiones: m.sessions, operaciones: m.executed, vetosPalermo: m.vetoes, devolucionesLisboa: m.returns, resultadoRealizadoUsd: m.realizedUsd },
    operaciones: m.trades,
    sesiones: recent.map((s) => ({ id: s.id, status: s.status, startedAt: s.startedAt, closedAt: s.closedAt, finalReport: s.finalReport })),
  })
}
