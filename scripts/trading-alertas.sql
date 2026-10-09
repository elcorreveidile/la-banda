-- Estado de las alertas de trading por símbolo (consejo+ 2/4). Idempotente.
-- Aplicar en Neon ANTES de desplegar (o `npm run db:push`). Ver drizzle/0012_*.sql.
CREATE TABLE IF NOT EXISTS "trading_alerta_estado" (
  "symbol" text PRIMARY KEY NOT NULL,
  "estado" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
