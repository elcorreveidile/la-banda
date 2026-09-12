CREATE TABLE "manuscripts" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"byline" text,
	"section" text NOT NULL,
	"format" text NOT NULL,
	"source_name" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objections" (
	"id" text PRIMARY KEY NOT NULL,
	"version_id" text NOT NULL,
	"session_id" text NOT NULL,
	"number" integer NOT NULL,
	"agent" text NOT NULL,
	"severity" text NOT NULL,
	"location" text,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "versions" (
	"id" text PRIMARY KEY NOT NULL,
	"manuscript_id" text NOT NULL,
	"number" integer NOT NULL,
	"text" text NOT NULL,
	"word_count" integer NOT NULL,
	"session_id" text,
	"decision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "objections" ADD CONSTRAINT "objections_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_manuscript_id_manuscripts_id_fk" FOREIGN KEY ("manuscript_id") REFERENCES "public"."manuscripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "objections_version" ON "objections" USING btree ("version_id","number");--> statement-breakpoint
CREATE INDEX "objections_session" ON "objections" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "versions_manuscript" ON "versions" USING btree ("manuscript_id","number");