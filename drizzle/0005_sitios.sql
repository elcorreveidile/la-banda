CREATE TABLE "site_files" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"path" text NOT NULL,
	"contenido" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" text PRIMARY KEY NOT NULL,
	"titulo" text NOT NULL,
	"modo" text NOT NULL,
	"alcance" text NOT NULL,
	"brief" text NOT NULL,
	"tenant_id" text,
	"subdominio" text,
	"estado" text DEFAULT 'recibido' NOT NULL,
	"entrega" jsonb,
	"entrega_error" text,
	"informe" jsonb,
	"session_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entregado_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "site_files" ADD CONSTRAINT "site_files_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_files_site" ON "site_files" USING btree ("site_id","path");--> statement-breakpoint
CREATE INDEX "sites_session" ON "sites" USING btree ("session_id");