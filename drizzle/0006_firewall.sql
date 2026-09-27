CREATE TABLE "firewall_revisiones" (
	"id" text PRIMARY KEY NOT NULL,
	"log_id" text,
	"tenant_id" text NOT NULL,
	"host" text NOT NULL,
	"target" text NOT NULL,
	"reason" text NOT NULL,
	"detail" text,
	"user_agent" text,
	"log_created_at" timestamp with time zone,
	"pattern_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"verdict" text,
	"confidence" real,
	"rationale" text,
	"cached" boolean DEFAULT false NOT NULL,
	"origen_id" text,
	"session_id" text,
	"aviso_estado" text DEFAULT 'no_aplica' NOT NULL,
	"aviso_intentos" integer DEFAULT 0 NOT NULL,
	"aviso_ultimo_at" timestamp with time zone,
	"aviso_ultimo_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "firewall_revisiones_patron" ON "firewall_revisiones" USING btree ("pattern_key","decided_at");--> statement-breakpoint
CREATE INDEX "firewall_revisiones_tenant_dia" ON "firewall_revisiones" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "firewall_revisiones_log" ON "firewall_revisiones" USING btree ("log_id");--> statement-breakpoint
CREATE INDEX "firewall_revisiones_sesion" ON "firewall_revisiones" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "firewall_revisiones_origen" ON "firewall_revisiones" USING btree ("origen_id");--> statement-breakpoint
CREATE INDEX "firewall_revisiones_aviso" ON "firewall_revisiones" USING btree ("aviso_estado","aviso_ultimo_at");