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
- **Auth.js v5**: enlace mágico por la API de Brevo (`src/lib/brevo.ts`, proveedor `email` propio en `auth.ts`; `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`), JWT, `trustHost: true`. **Jamás
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
- **Deployment Protection**: producción debe ser pública (en Vercel, Settings →
  Deployment Protection → solo previsualizaciones). Si no, la cadena de ticks y las
  llamadas de Olvidos/por2duros acaban en el SSO. Red de seguridad: `kickTick`
  añade `x-vercel-protection-bypass` si existe `VERCEL_AUTOMATION_BYPASS_SECRET`.
- **2026-09-13, sesiones del cron colgadas**: las 20 sesiones abiertas por el cron
  se quedaron «en curso» sin ejecutar ni un tick, mientras las lanzadas desde el
  panel cerraban bien. Causa: `selfOrigin(req.url)` en el cron daba la URL generada
  del despliegue (tras el SSO de la Deployment Protection estándar) y el tick recibía
  una redirección. Arreglo: `selfOrigin` prefiere `APP_URL`, luego
  `VERCEL_PROJECT_PRODUCTION_URL` (dominio público, lo expone Vercel) y solo al final
  el origen de la petición. Además, cada ciclo llama a `engine.recoverOpen`: relanza
  los ticks de las sesiones abiertas recientes y abandona (`failed`, evento
  `session_failed`) las de más de 90 min (`STALE_SESSION_MS`), cuyas velas ya no valen.
- **Cadena de ticks** (`src/engine/tick.ts`, `/api/engine/tick`): en Vercel
  cada invocación procesa un paso, responde 202 y en `after()` llama al
  siguiente tick con la cabecera `x-engine-secret` (= `CRON_SECRET`). Origen:
  `APP_URL` (o el de la petición). Así ningún agente depende del `maxDuration`
  y una caída deja el traspaso pendiente para el siguiente tick.
- **2026-09-14, cadena robusta**: la primera sesión del corpus se quedó con el traspaso
  a Berlín pendiente: Río tardó 4 min 25 s (el tick tiene `maxDuration = 300`) y el kick
  al siguiente tick no salió. Tres remedios: (1) **presupuesto de tiempo por agente**
  (`agentBudgetMs()`, `AGENT_BUDGET_MS`, def. 150 s): agotado, `runAgent` deja de
  ofrecer herramientas y pide `decide` con lo que haya (150 s + una llamada ≤120 s
  < 300 s); (2) `kickTick` **reintenta una vez** tras 2 s; (3) **cron horario de
  recuperación** `/api/cron/corpus-recuperar` (`35 * * * *`): `recoverOpen` + kicks,
  sin Clínica ni purga (el ciclo diario sigue en `/api/cron/corpus`). Con `CRON_SECRET`
  se puede lanzar a mano para reanudar una sesión colgada; y sin secreto, desde el panel:
  botón «Reanudar colgadas» de la tarjeta Corpus ELE (`resumeStalledSessions`, con la
  sesión del usuario; acepta `domain` por si otra tarjeta lo necesita).
- **2026-09-14, 508 de Vercel en la cadena**: en la sesión «bar, A2» Estocolmo, Río y
  Lisboa recibieron **508** de la Clínica (`leerEtiquetario`, `leerPcic`) y Berlín inventó
  17 códigos por no poder leer el etiquetario. Causa comprobada desde fuera: el borde de
  Vercel responde `508 INFINITE_LOOP_DETECTED` a toda petición cuya cabecera `x-vercel-id`
  lleve ~6 saltos o más (con 4, 401 normal), y Vercel añade un salto a cada `fetch`
  saliente de cada función: tick → tick → tick acumula. Regla: **las llamadas al propio
  tick y a la Clínica van por `fetchLimpio` (`src/lib/httpLimpio.ts`, `node:https`, sin
  traza)**, nunca por `fetch`. Cada tick nace limpio y la Clínica no ve saltos.
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

- **API v1** (`src/app/api/v1/`, `src/lib/apiAuth.ts`): decidido el 2026-09-12:
  un solo motor y dos escaparates. Olvidos muestra la redacción en su panel y
  por2duros la mesa de trading en una página pública; ambos consumen esta API
  desde el servidor con `LA_BANDA_API_KEY`. La Banda tiene base de datos propia
  (no la de Olvidos).

- **Corpus ELE** (`domains/corpus-ele/`, `src/lib/clinica.ts`, `src/lib/corpus/`):
  decidido el 2026-09-13 con Javier (plan maestro en
  `clinica-cultural/docs/plan-corpus-ele.md`; fase 1 = API de la Clínica, #210).
  **Los datos viven en la Clínica** (piezas, anotaciones, consentimiento,
  etiquetario cerrado): La Banda solo produce y anota contra `/api/corpus/*`
  con `CLINICA_URL` + `CLINICA_CORPUS_KEY` (cliente `clinica.ts`: nunca lanza,
  devuelve `{ error }`; sin variables, demo-safe). Un solo grafo lineal
  (Tokio → Denver → Estocolmo → Río → Berlín → Lisboa → Nairobi → Palermo →
  Helsinki → Profesor; Lisboa devuelve a Río o Berlín; Palermo veta) y dos
  tareas que los prompts distinguen por `payload.kind`: `muestra` (producir una
  muestra de habla situada en Granada, nivelada por el PCIC; Río es el único que
  redacta; Helsinki `escribirPieza` → `validada`, o `borrador` si Palermo objetó)
  y `produccion` (anotar la redacción seudonimizada de un alumno: **señalar, no
  corregir**, como Olvidos; Helsinki `escribirAnotaciones`). Reglas en todos los
  prompts: PCIC antes que nada, etiquetario cerrado, procedencia declarada /
  nunca inventar Granada. Entradas: `POST /api/v1/corpus/producir`,
  `POST /api/v1/corpus/anotar`, tarjeta del panel, y el cron diario
  `/api/cron/corpus` (`20 6 * * *`), que recoge de la Clínica hasta 3
  producciones pendientes con consentimiento, relanza abiertas, abandona las
  colgadas (6 h) y **purga la traza** de sesiones terminadas de este dominio
  pasados `CORPUS_TRACE_DAYS` (30): la traza lleva texto de alumnos (seudonimizado)
  y no debe vivir aquí para siempre. Nada de nombres ni correos en payloads: la
  Clínica manda seudónimo (`p-…`) y referencia.

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
3. Olvidos — **hecho** (v0.3.0, #3). Prueba con tres textos publicados:
   `scripts/olvidos-prueba.ts` + `docs/olvidos-prueba/` (Javier la corre en
   local; los tres se publicaron → veredicto esperado «publicable»).
4. Panel completo — **hecho** (v0.4.0): `sessionView.ts` (estado por agente),
   `SessionLive` (avatares + grafo d3 + log), gráficos Recharts en trading.
   d3 solo para el grafo (`d3-scale`, `d3-path`), como pide el brief.
5. Corpus ELE (dominio 3, fase 2 del plan) — **hecho** (v0.5.0): producción y
   anotación contra la API de la Clínica; fases 3-5 en el repo clinica-cultural.
