-- Con-textos 29N (la-banda): tabla del dominio política. Idempotente.
-- Pegar en el editor SQL de Neon de LA BANDA (no en el de WordNext ni en el de Olvidos) ANTES de desplegar.

CREATE TABLE IF NOT EXISTS "politica_piezas" (
	"id" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"edicion" text,
	"dia" text NOT NULL,
	"external_ref" text NOT NULL,
	"titulo" text,
	"encargo" text,
	"envio_ref" text,
	"estado" text DEFAULT 'en_curso' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"session_id" text,
	"programado_para" timestamp with time zone,
	"veredicto" text,
	"motivo" text,
	"nota" text,
	"remoto_id" text,
	"url" text,
	"review_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "politica_piezas_ref" ON "politica_piezas" USING btree ("external_ref");
CREATE INDEX IF NOT EXISTS "politica_piezas_estado" ON "politica_piezas" USING btree ("estado","created_at");
CREATE INDEX IF NOT EXISTS "politica_piezas_sesion" ON "politica_piezas" USING btree ("session_id");
CREATE INDEX IF NOT EXISTS "politica_piezas_dia" ON "politica_piezas" USING btree ("dia","edicion");
