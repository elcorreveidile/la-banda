-- Fase 3 del marketing (la-banda 0.13.0): tablas del dominio marketing. Idempotente.
-- Pegar en el editor SQL de Neon de LA BANDA (no en el de WordNext) ANTES de desplegar.

CREATE TABLE IF NOT EXISTS "marketing_piezas" (
	"id" text PRIMARY KEY NOT NULL,
	"tema_id" text NOT NULL,
	"version" integer NOT NULL,
	"locale" text NOT NULL,
	"titulo" text NOT NULL,
	"external_ref" text NOT NULL,
	"wordnext_id" text,
	"estado" text DEFAULT 'pending' NOT NULL,
	"url" text,
	"review_url" text,
	"feedback" text,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "marketing_temas" (
	"id" text PRIMARY KEY NOT NULL,
	"destino" text NOT NULL,
	"categoria" text NOT NULL,
	"titulo" text NOT NULL,
	"angulo" text NOT NULL,
	"publico" text,
	"palabras_clave" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estado" text DEFAULT 'propuesto' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"plan_session_id" text,
	"session_id" text,
	"programado_para" timestamp with time zone,
	"motivo" text,
	"nota" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decidido_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketing_piezas_ref" ON "marketing_piezas" USING btree ("external_ref");
CREATE INDEX IF NOT EXISTS "marketing_piezas_tema" ON "marketing_piezas" USING btree ("tema_id");
CREATE INDEX IF NOT EXISTS "marketing_piezas_wordnext" ON "marketing_piezas" USING btree ("wordnext_id");
CREATE INDEX IF NOT EXISTS "marketing_temas_estado" ON "marketing_temas" USING btree ("estado","created_at");
CREATE INDEX IF NOT EXISTS "marketing_temas_sesion" ON "marketing_temas" USING btree ("session_id");