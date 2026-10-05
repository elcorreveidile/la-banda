import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: ['./src/db/schema.ts', './src/db/trading.ts', './src/db/olvidos.ts', './src/db/peticiones.ts', './src/db/sitios.ts', './src/db/firewall.ts', './src/db/negociacion.ts', './src/db/marketing.ts', './src/db/politica.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
