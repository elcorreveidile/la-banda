CREATE TABLE "trading_alerta_estado" (
	"symbol" text PRIMARY KEY NOT NULL,
	"estado" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
