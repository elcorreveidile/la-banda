-- Mi cartera (tenencias reales de cripto del usuario). Idempotente.
-- Aplicar en Neon ANTES de desplegar (o `npm run db:push`). Ver drizzle/0010_*.sql.
CREATE TABLE IF NOT EXISTS "crypto_cartera" (
  "owner" text NOT NULL,
  "symbol" text NOT NULL,
  "unidades" numeric(24, 12) NOT NULL,
  "ref_price_usd" numeric(18, 8) NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "crypto_cartera_owner_symbol_pk" PRIMARY KEY ("owner", "symbol")
);
