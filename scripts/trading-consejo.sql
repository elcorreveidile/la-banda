-- consejo+ 3/4 y 4/4: track record de recomendaciones + perfil de inversión. Idempotente.
-- Aplicar en Neon ANTES de desplegar (o `npm run db:push`). Ver drizzle/0013_*.sql.

-- Foto diaria de la recomendación por símbolo (para puntuar aciertos con el tiempo).
CREATE TABLE IF NOT EXISTS "recomendacion_historial" (
  "symbol" text NOT NULL,
  "day" text NOT NULL,
  "accion" text NOT NULL,
  "precio_usd" numeric(18, 8) NOT NULL,
  "confianza" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "recomendacion_historial_symbol_day_pk" PRIMARY KEY ("symbol", "day")
);

-- Perfil de inversión del usuario (horizonte + tolerancia al riesgo).
CREATE TABLE IF NOT EXISTS "trading_perfil" (
  "owner" text PRIMARY KEY NOT NULL,
  "horizonte" text NOT NULL,
  "tolerancia" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
