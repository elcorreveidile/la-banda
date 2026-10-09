CREATE TABLE "recomendacion_historial" (
	"symbol" text NOT NULL,
	"day" text NOT NULL,
	"accion" text NOT NULL,
	"precio_usd" numeric(18, 8) NOT NULL,
	"confianza" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recomendacion_historial_symbol_day_pk" PRIMARY KEY("symbol","day")
);
--> statement-breakpoint
CREATE TABLE "trading_perfil" (
	"owner" text PRIMARY KEY NOT NULL,
	"horizonte" text NOT NULL,
	"tolerancia" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
