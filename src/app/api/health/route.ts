import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { hasProvider } from '@/engine/provider'

export const dynamic = 'force-dynamic'

const VARS = ['DATABASE_URL', 'AUTH_SECRET', 'BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'ALLOWED_EMAILS', 'ZAI_API_KEY', 'ANTHROPIC_API_KEY', 'CRON_SECRET', 'APP_URL', 'LA_BANDA_API_KEY', 'VERCEL_AUTOMATION_BYPASS_SECRET'] as const

/**
 * GET /api/health → diagnóstico de despliegue. Público: solo dice qué variables
 * están presentes (nunca valores). Con `Authorization: Bearer CRON_SECRET` añade
 * el host de la base de datos y si las tablas del motor existen.
 */
export async function GET(req: Request) {
  const present = Object.fromEntries(VARS.map((k) => [k, Boolean(process.env[k]?.trim())]))
  const body: Record<string, unknown> = {
    ok: true,
    vercel: { env: process.env.VERCEL_ENV ?? null, branch: process.env.VERCEL_GIT_COMMIT_REF ?? null, sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null },
    variables: present,
    proveedor: hasProvider() ? (process.env.ZAI_API_KEY?.trim() ? 'zai' : 'anthropic') : null,
  }

  const secret = process.env.CRON_SECRET?.trim()
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) {
    const url = process.env.DATABASE_URL?.trim()
    let host: string | null = null
    try {
      host = url ? new URL(url).host : null
    } catch {
      host = 'formato no válido'
    }
    let tablas: string[] | string = 'sin conexión'
    try {
      const rows = (await db.execute(sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`)) as unknown as { rows?: { table_name: string }[] } | { table_name: string }[]
      const list = Array.isArray(rows) ? rows : (rows.rows ?? [])
      tablas = list.map((r) => r.table_name)
    } catch (err) {
      tablas = `error: ${err instanceof Error ? err.message : String(err)}`
    }
    body.baseDeDatos = { host, tablas }
  }
  return NextResponse.json(body)
}
