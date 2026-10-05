CREATE TABLE "politica_piezas" (
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
--> statement-breakpoint
CREATE UNIQUE INDEX "politica_piezas_ref" ON "politica_piezas" USING btree ("external_ref");--> statement-breakpoint
CREATE INDEX "politica_piezas_estado" ON "politica_piezas" USING btree ("estado","created_at");--> statement-breakpoint
CREATE INDEX "politica_piezas_sesion" ON "politica_piezas" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "politica_piezas_dia" ON "politica_piezas" USING btree ("dia","edicion");