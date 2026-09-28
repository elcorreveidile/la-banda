CREATE TABLE "marketing_piezas" (
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
--> statement-breakpoint
CREATE TABLE "marketing_temas" (
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
--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_piezas_ref" ON "marketing_piezas" USING btree ("external_ref");--> statement-breakpoint
CREATE INDEX "marketing_piezas_tema" ON "marketing_piezas" USING btree ("tema_id");--> statement-breakpoint
CREATE INDEX "marketing_piezas_wordnext" ON "marketing_piezas" USING btree ("wordnext_id");--> statement-breakpoint
CREATE INDEX "marketing_temas_estado" ON "marketing_temas" USING btree ("estado","created_at");--> statement-breakpoint
CREATE INDEX "marketing_temas_sesion" ON "marketing_temas" USING btree ("session_id");