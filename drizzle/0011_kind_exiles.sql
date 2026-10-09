CREATE TABLE "crypto_cartera_historial" (
	"owner" text NOT NULL,
	"day" text NOT NULL,
	"valor_eur" numeric(18, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_cartera_historial_owner_day_pk" PRIMARY KEY("owner","day")
);
