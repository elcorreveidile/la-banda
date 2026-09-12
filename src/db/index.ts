import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as core from './schema'
import * as trading from './trading'
import * as olvidos from './olvidos'

const schema = { ...core, ...trading, ...olvidos }

/**
 * Conexión a Neon por HTTP: sin transacciones (cada consulta va sola).
 * El motor escribe siempre fila a fila, así que no las necesita.
 * Se abre en la primera consulta, no al importar: así `next build` no exige DATABASE_URL.
 */
type Database = ReturnType<typeof connect>

function connect() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Falta DATABASE_URL')
  return drizzle(neon(url), { schema })
}

const globalForDb = globalThis as unknown as { db?: Database }

/** Instancia real (para quien necesite identidad, p. ej. el adaptador de Auth.js). */
export function getDb(): Database {
  if (!globalForDb.db) globalForDb.db = connect()
  return globalForDb.db
}

export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const real = getDb()
    const value = Reflect.get(real, prop, receiver)
    return typeof value === 'function' ? value.bind(real) : value
  },
})

export type Db = Database
export { schema }
