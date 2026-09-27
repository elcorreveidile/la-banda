CREATE TABLE "peticiones" (
	"id" text PRIMARY KEY NOT NULL,
	"titulo" text NOT NULL,
	"texto" text NOT NULL,
	"webhook_url" text,
	"referencia" text,
	"estado" text DEFAULT 'recibida' NOT NULL,
	"informe" jsonb,
	"session_id" text,
	"aviso_estado" text DEFAULT 'no_aplica' NOT NULL,
	"aviso_intentos" integer DEFAULT 0 NOT NULL,
	"aviso_ultimo_at" timestamp with time zone,
	"aviso_ultimo_error" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completada_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "peticiones_avisos" (
	"id" text PRIMARY KEY NOT NULL,
	"peticion_id" text NOT NULL,
	"intento" integer NOT NULL,
	"estado" text NOT NULL,
	"codigo" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "peticiones_avisos" ADD CONSTRAINT "peticiones_avisos_peticion_id_peticiones_id_fk" FOREIGN KEY ("peticion_id") REFERENCES "public"."peticiones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "peticiones_aviso" ON "peticiones" USING btree ("aviso_estado","aviso_ultimo_at");--> statement-breakpoint
CREATE INDEX "peticiones_avisos_peticion" ON "peticiones_avisos" USING btree ("peticion_id","intento");