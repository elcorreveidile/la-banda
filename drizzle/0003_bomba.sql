ALTER TABLE "handoffs" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "handoffs" ADD COLUMN "intentos" integer DEFAULT 0 NOT NULL;