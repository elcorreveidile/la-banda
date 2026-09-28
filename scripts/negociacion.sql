-- Fase 4a (red de webs agénticas): tablas red_nodos y red_negociaciones.
-- Idempotente: se puede pegar en el editor SQL de Neon las veces que haga falta.
CREATE TABLE IF NOT EXISTS "red_negociaciones" (
	"id" text PRIMARY KEY NOT NULL,
	"comprador_nodo_id" text NOT NULL,
	"vendedor_nodo_id" text NOT NULL,
	"referencia" text,
	"texto" text NOT NULL,
	"lineas" jsonb NOT NULL,
	"presupuesto_max_cents" integer NOT NULL,
	"vendedor" jsonb NOT NULL,
	"estado" text DEFAULT 'negociando' NOT NULL,
	"motivo" text,
	"ofertas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"intentos_fuera_limite" integer DEFAULT 0 NOT NULL,
	"turno" text DEFAULT 'vendedor' NOT NULL,
	"ofertas_vistas" integer DEFAULT 0 NOT NULL,
	"desenlace" text,
	"inyeccion_de" text,
	"propuesta" jsonb,
	"aprobada_comprador_at" timestamp with time zone,
	"aprobada_vendedor_at" timestamp with time zone,
	"rechazada_por" text,
	"session_id" text,
	"aviso_estado" text DEFAULT 'no_aplica' NOT NULL,
	"aviso_intentos" integer DEFAULT 0 NOT NULL,
	"aviso_ultimo_at" timestamp with time zone,
	"aviso_ultimo_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cerrada_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "red_nodos" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"host" text NOT NULL,
	"nombre" text NOT NULL,
	"sector" text DEFAULT 'general' NOT NULL,
	"capacidades" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"catalogo" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"limites" jsonb NOT NULL,
	"clave_hash" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "red_negociaciones_comprador" ON "red_negociaciones" USING btree ("comprador_nodo_id","created_at");
CREATE INDEX IF NOT EXISTS "red_negociaciones_vendedor" ON "red_negociaciones" USING btree ("vendedor_nodo_id","created_at");
CREATE INDEX IF NOT EXISTS "red_negociaciones_sesion" ON "red_negociaciones" USING btree ("session_id");
CREATE INDEX IF NOT EXISTS "red_negociaciones_aviso" ON "red_negociaciones" USING btree ("aviso_estado","aviso_ultimo_at");
CREATE UNIQUE INDEX IF NOT EXISTS "red_nodos_tenant" ON "red_nodos" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "red_nodos_activo" ON "red_nodos" USING btree ("activo","sector");