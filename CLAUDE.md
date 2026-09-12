# la-banda — motor de agentes de La Banda

Repo independiente (decidido el 2026-09-12: ni monorepo ni dentro de
X-dos-duros, que es una app suelta con Prisma + Supabase). El brief completo
está en `docs/brief.md`; léelo antes de tocar el motor o los dominios.

## Arquitectura

- **Next.js 15** (App Router). **Drizzle + Neon** por `neon-http`: **sin
  transacciones**, todo fila a fila (el motor ya está escrito así). Esquema en
  `src/db/schema.ts`; se aplica con `npm run db:push` (Javier lo ejecuta contra
  producción) o copiando `drizzle/0000_inicial.sql`. `npm run db:generate` tras
  cambiar el esquema y commitear `drizzle/` (incluida `meta/`).
- **Auth.js v5**: enlace mágico por Resend, JWT, `trustHost: true`. **Jamás
  `AUTH_URL` en producción** (misma lección que wp-next-starter). Tablas de auth
  con prefijo `auth_` para no chocar con `sessions` del motor. Solo entran los
  correos de `ALLOWED_EMAILS`. `auth.config.ts` (Edge, sin adaptador) alimenta al
  middleware; `auth.ts` añade adaptador y proveedor de forma perezosa (la
  conexión se abre en la primera petición, así `next build` no exige env).
- **Motor** (`src/engine/`): `createEngine(store, runAgent)`. El almacén es una
  interfaz (`EngineStore`) para poder testear con memoria (`tests/memoryStore.ts`).
  `runAgent` usa la API de Anthropic (`ANTHROPIC_MODEL`, por defecto
  `claude-opus-5`; `ANTHROPIC_EFFORT` low|medium|high) con bucle manual de
  herramientas y una herramienta `decide` para la salida estructurada.
- **Dominios** (`domains/<nombre>/config.ts`): roles, prompts, herramientas y
  grafo (`transitions`, `returns`, `entry`, `closer`, `maxSteps`). El motor no
  sabe nada del contenido. `validateDomain()` corre al cargar el registro.
- **Panel** (`/panel`): lanza sesiones del dominio toy con una server action que
  deja correr el orquestador en `after()`; el log sondea `/api/panel/events`
  cada 2 s mientras la sesión esté abierta.

## Convenciones

- Validación antes de push: `npm run lint && npm run typecheck && npm test &&
  npm run build`.
- Flujo de PRs: rama `claude/...`, PR en borrador, Javier aprueba con «fusiona»
  → squash con título `Título (#N)`.
- Copy y comentarios en español. Estética del panel: monoespaciada, tarjetas,
  fondo claro, sin adornos que no muestren datos.
- Cualquier decisión de arquitectura que no esté en el brief se pregunta antes.

## Fases (brief §8)

1. Motor y log — **hecho** (este repo, v0.1.0).
2. Trading simulado (diez roles, velas reales, cartera ficticia, cron horario).
3. Olvidos (segundo dominio).
4. Panel completo (grafo, métricas, avatares).
