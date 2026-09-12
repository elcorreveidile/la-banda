CREATE TABLE "orders_sim" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"symbol" text NOT NULL,
	"side" text DEFAULT 'buy' NOT NULL,
	"size_usd" numeric(18, 8) NOT NULL,
	"qty" numeric(24, 12) NOT NULL,
	"entry_price" numeric(18, 8) NOT NULL,
	"reference_price" numeric(18, 8) NOT NULL,
	"fees_usd" numeric(18, 8) NOT NULL,
	"stop_price" numeric(18, 8) NOT NULL,
	"target_price" numeric(18, 8),
	"max_hours_open" integer DEFAULT 0 NOT NULL,
	"conditions" text,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"exit_price" numeric(18, 8),
	"exit_reason" text,
	"pnl_usd" numeric(18, 8),
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio" (
	"id" text PRIMARY KEY NOT NULL,
	"initial_usd" numeric(18, 8) NOT NULL,
	"cash_usd" numeric(18, 8) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"symbol" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"open" numeric(18, 8) NOT NULL,
	"high" numeric(18, 8) NOT NULL,
	"low" numeric(18, 8) NOT NULL,
	"close" numeric(18, 8) NOT NULL,
	"volume" numeric(24, 8) NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "prices_symbol_ts_pk" PRIMARY KEY("symbol","ts")
);
--> statement-breakpoint
CREATE INDEX "orders_sim_status" ON "orders_sim" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_sim_session" ON "orders_sim" USING btree ("session_id");