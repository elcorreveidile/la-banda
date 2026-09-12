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
  `step()` procesa UN traspaso; `runSession()` los encadena. `runAgent` hace un
  bucle manual de herramientas y termina con la herramienta `decide` (salida
  estructurada, validada con Zod). **Proveedor** (`provider.ts`, patrón de
  wp-next-starter): z.ai si hay `ZAI_API_KEY` (`ZAI_MODEL` def. `glm-5.3`,
  endpoint compatible con el SDK de Anthropic), si no Anthropic
  (`ANTHROPIC_MODEL` def. `claude-opus-5`). `output_config.effort` solo se
  envía a Anthropic. `AgentConfig.model` sobreescribe el modelo por agente.
- **Cadena de ticks** (`src/engine/tick.ts`, `/api/engine/tick`): en Vercel
  cada invocación procesa un paso, responde 202 y en `after()` llama al
  siguiente tick con la cabecera `x-engine-secret` (= `CRON_SECRET`). Origen:
  `APP_URL` (o el de la petición). Así ningún agente depende del `maxDuration`
  y una caída deja el traspaso pendiente para el siguiente tick.
- **Trading** (`src/lib/trading/`, `domains/trading/`): decidido el
  2026-09-12 con Javier: cadena de ticks, proveedor z.ai (también la búsqueda
  web de Denver, `src/lib/webSearch.ts`, 0,01 $/uso) y **ejecución
  determinista**: Helsinki registra con `writeLedger` y el código compra al
  último cierre (`sim.ts`: slippage 0,3 %, comisión 0,1 %) y gestiona
  stop/objetivo/caducidad en cada ciclo (`manageOpenPositions`). Solo largos
  al contado. Velas: Coinbase Exchange, Kraken de respaldo (Binance bloquea
  por región). Cron `5 * * * *` en `vercel.json` (`CRON_SECRET`).
- **Dominios** (`domains/<nombre>/config.ts`): roles, prompts, herramientas y
  grafo (`transitions`, `returns`, `entry`, `closer`, `maxSteps`). El motor no
  sabe nada del contenido. `validateDomain()` corre al cargar el registro.
- **Panel** (`/panel`): lanza sesiones toy (orquestador en `after()`) y ciclos
  de trading (mismo camino que el cron); tarjeta de métricas de trading
  (`metrics.ts`); el log sondea `/api/panel/events` cada 2 s mientras la
  sesión esté abierta.

- **Olvidos** (`src/lib/olvidos/`, `domains/olvidos/`): manuscrito → `manuscripts`
  + `versions` (v1; `.docx` con mammoth) → sesión `olvidos` por la cadena de
  ticks. Las herramientas localizan el manuscrito por el payload de la tarea
  (`manuscriptForTask(ctx.taskId)`). Palermo NO usa la acción `veto` del motor
  para vetar la publicación: pasa a Helsinki con `veredictoPalermo` para que el
  informe se emita igual (el `veto` del motor queda para procesos que no pueden
  continuar). Helsinki registra objeciones y decisión en `objections` /
  `versions.decision`. **Hoja de estilo y límites de sección son PROPUESTA**
  (no había en el repo `olvidos`): Javier corrige en `hojaDeEstilo.ts` y
  `secciones.ts`. Pendiente del brief: probar con tres textos ya publicados y
  comparar con lo decidido en su momento.

## Convenciones

- Validación antes de push: `npm run lint && npm run typecheck && npm test &&
  npm run build`.
- Flujo de PRs: rama `claude/...`, PR en borrador, Javier aprueba con «fusiona»
  → squash con título `Título (#N)`.
- Copy y comentarios en español. Estética del panel: monoespaciada, tarjetas,
  fondo claro, sin adornos que no muestren datos.
- Cualquier decisión de arquitectura que no esté en el brief se pregunta antes.

## Fases (brief §8)

1. Motor y log — **hecho** (v0.1.0, #1).
2. Trading simulado — **hecho** (v0.2.0, #2): dejarlo correr una semana.
3. Olvidos — **hecho** (v0.3.0): falta la prueba con tres textos publicados.
4. Panel completo (grafo, métricas, avatares).
