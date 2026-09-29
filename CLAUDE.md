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
  cada invocación procesa UN paso, responde 202 y lo ejecuta en `after()`. Desde
  v0.6.0 **no llama al siguiente**: la bomba (`/api/cron/tick`, cada minuto) lanza el
  tick de cada sesión con traspaso pendiente (cabecera `x-engine-secret` =
  `CRON_SECRET`; origen `APP_URL`). Así ningún agente depende del `maxDuration`,
  una caída deja el traspaso pendiente y no se acumula la traza de Vercel (508).
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
- **2026-09-14, anotaciones robustas (corpus-ele)**: la primera pieza se registró con 0
  anotaciones. Causas: los agentes escribían `"codigo": "funcion:f5-…"` (con prefijo de
  capa) y la Clínica lo rechazaba; Nairobi perdió el array corregido de Berlín; Helsinki,
  ante el 400, lo tiró todo. Ahora `escribirPieza`/`escribirAnotaciones`
  (`src/lib/corpus/anotaciones.ts`) **normalizan** (sin prefijo), **fusionan** con las
  listas del dossier (traspasos de la tarea; versión más reciente de cada una),
  **filtran** contra `leerEtiquetario` y, si aun así la Clínica devuelve 400 con
  `invalidas`, reintentan UNA vez sin ellas. Devuelven `descartadas` para el informe.
  Los prompts piden capa y código por separado, sin prefijo.
- **2026-09-14, el dossier lo funde el motor**: la muestra «farmacia» murió en Lisboa con
  «decisión inválida: action: Required» ×3: el dossier viajaba ENTERO en cada traspaso
  (texto, avisos, 20 anotaciones con notas…) y al devolverlo más lo suyo, la salida del
  modelo se cortaba por `max_tokens` y `decide` llegaba vacío. Ahora en `pass`/`return`
  el motor hace `{ ...traspasoRecibido, ...payloadDevuelto }` (`fundirPayload`,
  `orchestrator.ts`; `close`/`veto` no funden), el marco común pide «devuelve SOLO tus
  campos nuevos», `max_tokens` sube a 16000 y una salida cortada (`stop_reason:
  max_tokens` o `decide` sin `action`) recibe un aviso y un reintento en vez de tumbar
  la sesión. Compatible con toy/trading/olvidos (devolver todo sigue valiendo).
- **2026-09-14, el motor NO se auto-encadena (v0.6.0)**: la 2.ª muestra «farmacia» volvió
  a recibir 508 de la Clínica en el 4.º agente pese a `fetchLimpio` (Vercel inyecta la
  traza fuera del proceso: lo que cuenta es que cada tick nacía de otro tick), Lisboa
  murió por «Request timed out» del proveedor y el motor cerraba la sesión al primer
  error; además dos ticks podían procesar el mismo traspaso. Ahora:
  (1) **el tick procesa UN paso y no llama al siguiente**; la **bomba** (`src/lib/bomba.ts`,
  `/api/cron/tick`, `* * * * *`, Vercel Pro admite cada minuto) lanza un tick por cada
  sesión abierta con traspaso pendiente y sin agente en curso, siempre desde cero (1-2
  saltos: sin 508). El botón «Reanudar colgadas» del panel ejecuta un ciclo de la bomba.
  Los que abren sesión (API v1, panel, crons de trading y corpus) siguen dando el primer
  kick. (2) **Bloqueo de traspasos**: `claimHandoff` (pending → in_progress, `claimed_at`,
  una sola sentencia UPDATE … WHERE status='pending'); si otro tick lo reclamó, `step`
  devuelve `skipped`. (3) **Reintento**: error de agente → el traspaso vuelve a pending con
  `intentos+1` y la bomba lo relanza; al 2.º fallo (`MAX_INTENTOS`) la sesión cae.
  `releaseStale` devuelve a pending los in_progress de más de 7 min (tick muerto).
  Esquema: `drizzle/0003_bomba.sql` (`handoffs.claimed_at`, `handoffs.intentos`); Javier lo
  ejecuta en Neon ANTES de desplegar. Coste asumido: hasta 1 min entre agentes.
  `/api/cron/corpus-recuperar` desaparece (lo cubre la bomba).
- **2026-09-14, tiempos del proveedor (v0.6.1–0.6.2)**: la muestra B2 «piso» murió dos
  veces por «Request timed out» (Río la primera, Berlín la segunda): cada intento duraba
  4 min = 120 s de tope del SDK × su reintento interno. Causa de fondo: el `timeout` del SDK
  solo cuenta hasta que llegan las cabeceras, y SIN streaming el servidor no manda nada
  hasta acabar de generar; un B2 largo en GLM pasa de 120 s con normalidad. Ahora
  **todas las llamadas van en streaming** (`runAgent.ts`, `pedir`: `messages.stream(…,
  { signal }).finalMessage()`) con tope propio por llamada `min(PROVIDER_TIMEOUT_MS = 180 s,
  lo que quede de AGENT_DEADLINE_MS = 270 s)` → error «sin respuesta del proveedor en N s»
  que el motor reintenta vía la bomba; `maxRetries: 0` en el SDK; `AGENT_BUDGET_MS` 100 s de
  herramientas (100 + 180 < 300 s del tick). Modelos: `providerFor(agent.model)` admite
  `'anthropic:claude-sonnet-5'` / `'zai:glm-5.3'` (sin clave, avisa y usa el predeterminado);
  Río lo lee de `CORPUS_MODELO_REDACTOR`; `DEFAULT_PROVIDER=anthropic|zai` cambia el
  predeterminado de todos sin quitar la clave de z.ai (la búsqueda web la sigue usando).
- **2026-09-14, fusión profunda del dossier (v0.6.3)**: con Claude (Sonnet 5,
  `DEFAULT_PROVIDER=anthropic`) la B2 «piso» recorrió los diez agentes en 9 min 38 s sin un
  solo error de proveedor, pero llegó al Profesor como «fallida»: Berlín devolvió
  `{ borrador: { anotacionesBerlin } }` (su campo anidado bajo el de Río) y la fusión
  superficial sustituyó `borrador` entero → `ficha.texto: null`, Palermo vetó y Helsinki
  registró la pieza `7e9e1dac…` (borrador) con un texto que no era el de Río. Ahora
  `fundirPayload` es **profunda** (objetos planos se funden nivel a nivel; arrays y
  primitivos sustituyen), `extraerAnotacionesDelDossier` mira también dentro de `borrador`,
  `escribirPieza` toma el **texto del `borrador` más reciente del dossier**
  (`extraerTextoDelDossier`; la ficha o Helsinki solo si no lo hay; devuelve `textoOrigen`)
  y COMUN pide el campo nuevo «en la RAÍZ del payload, nunca dentro de borrador ni ficha».
- **2026-09-14, spans por cita y ticks encadenados (v0.6.6)**: dos mejoras para que
  generar corpus sea rápido y fiable. (1) **Spans por cita**: los agentes de muestra
  (Berlín, Lisboa) dan la CITA EXACTA del texto en "cita" en vez de calcular inicio/fin;
  `escribirPieza` resuelve el span buscando la cita en el texto (`resolverAnotacion` /
  `fusionarConTexto` en `anotaciones.ts`), y descarta las citas que no aparecen. Adiós a
  los vetos de Palermo por «spans que no cuadran»; menos salida del modelo. (2) **Ticks
  encadenados**: el tick sigue SIN llamar a otro tick por HTTP (eso reabría el 508), pero
  ahora procesa VARIOS pasos seguidos dentro de la misma función (`procesarEnCadena` en
  `tick.ts`) mientras quede presupuesto (`TICK_BUDGET_MS` 285 s, `MIN_CHAIN_MS` 90 s); cada
  paso encadenado recibe el tiempo restante como `deadlineMs` (via `engine.step(…, { deadlineMs })`
  → `runAgent`), así ninguno pasa del `maxDuration` 300 s. Los pasos cortos (Tokio, Denver,
  Estocolmo…) van seguidos: una muestra baja de ~25 min a ~10. La bomba sigue cubriendo lo
  que no dé tiempo. `claimHandoff` evita que la bomba y la cadena procesen el mismo paso.
- **2026-09-17, tipo `texto_escrito` (v0.8.0)**: cuarto tipo de muestra, para **textos escritos
  de composición** (entrada de blog, reseña, carta formal, artículo de opinión, narración, informe,
  artículo académico…), como MODELO para las Redacciones de la Clínica. Se amplió el enum en los 6
  puntos (`domains/corpus-ele/tools.ts`, `src/lib/corpus/cycle.ts`, `src/app/panel/actions.ts`,
  `src/app/api/v1/corpus/producir/route.ts`, `src/app/panel/CorpusCard.tsx`, `src/lib/clinica.ts`) y
  los prompts: **Río** redacta según el GÉNERO (llega en `situacion`/`notas`) en registro escrito,
  con cohesión y convenciones del género, sin color oral, y sin inventar citas/cifras/fuentes en
  textos formales; **Tokio** fija el género (inv. 7 PCIC) y **Estocolmo** el registro/cohesión;
  **Palermo** condiciona a `muestra_habla` los criterios de oralidad (trato, color oral, saludos) y
  añade el criterio (k) de texto escrito (género/registro/cohesión, fuentes inventadas). El `tipo`
  viaja como string a la Clínica sin transformar; la Clínica debe aceptar `texto_escrito` (v3.183).
- **2026-09-14, rúbrica de credibilidad (v0.7.0)**: tras revisar la muestra de bar A2 («Aquí
  la tapa va con la consumición»), que salía en **usted** en una taberna, sin color oral, con la
  lógica de la tapa incoherente y saludos a deshora, se ataca el fallo en el ORIGEN, **sin tocar
  el motor** (todo en `domains/corpus-ele/`, así trading y olvidos no cambian): (1) **Río** ajusta
  el TRATO al escenario (tú/vosotros en bares y sitios casuales; usted solo en gestiones formales),
  da SIEMPRE color oral de Granada en muestra de habla, respeta la lógica local (la tapa gratis no
  se cobra luego) y cuadra saludos/hora. (2) **Palermo** aplica una **rúbrica de credibilidad**:
  veta además por trato inadecuado, incoherencia interna/local, falta de color oral, saludos/hora
  incongruentes o densidad de anotación insuficiente (sigue con el flag `veredictoPalermo`, no la
  acción `veto` del motor). (3) **Guarda de código en `escribirPieza`**: una muestra que se queda
  con **0 anotaciones** se registra como `borrador` pase lo que pase el modelo (`forzadoBorrador`),
  espejo de la guarda de la Clínica (v3.182). Solo prompts + ese guard.
- **2026-09-14, calidad de las muestras (v0.6.7)**: tras revisar la muestra B2 «piso»,
  ajuste de prompts de corpus-ele: Río cuida la **coherencia interna** del escenario (nº de
  habitaciones = inquilinos, metros, precios) y da **color oral de Granada** en las muestras
  de habla (sin caricatura); Berlín no confunde condicional de estimación con futuro de
  probabilidad; Lisboa anota **léxico específico** del tema (fianza, suministros, comunidad…)
  y devuelve a Río si hay **contradicciones internas**. Solo prompts.
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
- **Panel** (`/panel`): **pestañas por dominio** (`?tab=corpus|trading|olvidos`,
  def. Corpus o el dominio de la sesión elegida). Cada pestaña muestra su tarjeta
  (Corpus / ciclo de trading + métricas / Olvidos) y filtra la lista de sesiones por
  su dominio. El ciclo de trading se lanza desde su pestaña (mismo camino que el
  cron). El log sondea `/api/panel/events` cada 2 s mientras la sesión esté abierta.
  El dominio **toy** ya no tiene lanzador en el panel (era de prueba); sigue
  registrado y lo usan los tests del motor (`tests/orchestrator.test.ts`).

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
- **2026-09-23, secciones de Olvidos: falta «Con-textos»**: al enviar un manuscrito
  desde el panel, el desplegable «Sección de destino» no ofrecía **Con-textos**, que en
  el repo `olvidos` sí es sección de primer nivel (categoría `?categoria=con-textos`, con
  dossiers interactivos de fondo). Causa: `SECCIONES` (`domains/olvidos/secciones.ts`)
  es una propuesta transcrita a mano el 2026-09-12 que nunca la incluyó, y de ese único
  array cuelgan el desplegable (`OlvidosCard.tsx`), la validación (`actions.ts` →
  `getSection`) y la API v1 (`/api/v1/olvidos/manuscritos`). Se añade la entrada
  `con-textos` (rango tipo ensayo, 1200–6500, aviso >4.000; los elementos interactivos se
  describen aparte, no cuentan como palabras) y se cita la sección en `hojaDeEstilo.ts`.
  Sin cambios de esquema (`manuscripts.section` guarda la key como texto).

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

- **2026-09-18, portada pública (v0.9.0)**: `kupeku.com` mostraba solo el login (la
  home `/` redirigía a `/panel` → `/login`). Ahora `/` es una **landing bilingüe** (ES/EN
  por `?lang=en`; el panel y el login siguen en español) que explica qué es La Banda, sus
  seis principios (§2 del brief), presenta a los diez agentes, muestra los **tres dominios en
  producción** (corpus-ele, trading, olvidos) y a qué otros campos se aplica, con un bloque
  «el modelo de IA lo eliges tú» (agnóstico de proveedor: Claude/GLM, modelo por agente,
  failover) y **precios en tres niveles** («desde» + contacto: Piloto / Operación / A medida;
  cifras orientativas, ajustables). Contenido en `src/lib/landing/content.ts` (dict `es`/`en`,
  el español fija el tipo). **Contacto**: `src/components/landing/ContactForm.tsx` (cliente) →
  `POST /api/contacto`, aviso por Brevo a `CONTACT_EMAIL`; antispam **honeypot + Cloudflare
  Turnstile** (`src/lib/turnstile.ts`; sin `TURNSTILE_SECRET_KEY` se omite). La home fija
  `robots: index` (el resto del sitio sigue `noindex` por el layout). Reutiliza `Logo` y la
  estética del panel (mono para etiquetas, sans para prosa, tarjetas, fondo claro). Envs
  nuevas: `CONTACT_EMAIL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`.

- **2026-09-27, firewall agéntico — carril profundo (v0.10.0, Fase 2b de la web agéntica de
  WordNext)**. wp-next-starter (1.65.x) tiene el carril RÁPIDO determinista (allow/deny/quarantine,
  sin LLM) y manda aquí las cuarentenas POR CONTENIDO, ya deduplicadas y con tope 50/día por tenant.
  La Banda NO bloquea en línea: juzga después y el veredicto **solo informa** (no toca las listas del
  tenant). Decidido con Javier por AskUserQuestion: modelos mixtos, tabla propia, webhook + GET, solo
  tres mesas, tope 50/día con 429, caché solo con confianza ≥ 0,7, sin webhook en respuestas de caché.
  - **Dominio `firewall`** (`domains/firewall/`): Tokio (mesa de inyección de prompt) → Berlín (mesa
    de exfiltración/copia) → Denver (mesa de anomalía) → Profesor (árbitro; puede devolver UNA vez a
    una mesa) → Palermo (cortafuegos, `canVeto`, `closer`). **La acción de Palermo es el veredicto**:
    `close` = `benign` (falso positivo), `veto` = `malicious` (se confirma el bloqueo); ambos con
    `{ verdict, confidence 0-1, rationale }` (`src/lib/firewall/veredicto.ts`). Sin mesas de
    identidad/authz ni de política de contenido: la superficie es de solo lectura y sin identidad
    (identidad tendrá sentido en la Fase 3, mandato firmado).
  - **Modelos**: mesas `FIREWALL_MODELO_MESA` (def. `anthropic:claude-sonnet-5`), árbitro y
    cortafuegos `FIREWALL_MODELO_JUEZ` (def. `anthropic:claude-opus-5-5`). Un modelo sin prefijo se fija
    a `anthropic:`; z.ai solo con `zai:…` explícito. **Sin la clave del proveedor nombrado no se abre
    mesa (503)**, en vez de caer al predeterminado (`providerFor` caería a z.ai): tráfico de clientes
    nunca va a z.ai por defecto.
  - **Dato que no es de fiar**: el fragmento, el destino, el host y el user-agent NO van en el payload
    de la tarea (solo `{ kind, revisionId, reason }`); los sirve la herramienta `leerCuarentena` entre
    marcas `<<<DATO_NO_FIABLE_<testigo aleatorio>>>` con los invisibles a la vista (`patron.ts`,
    `delimitar`/`visibilizar`). Es la ÚNICA herramienta y solo lee: ningún agente actúa fuera. Los
    prompts piden no obedecer ni copiar el fragmento; `limpiarRationale` lo quita si aun así aparece.
  - **Tabla `firewall_revisiones`** (`src/db/firewall.ts`, `drizzle/0006_firewall.sql`; **Javier
    ejecuta ese SQL en Neon ANTES de desplegar**). `abrirRevision` (`src/lib/firewall/cycle.ts`)
    resuelve en orden: idempotencia por `logId` → **caché por patrón** (`patternKey` = sha256 de
    motivo + destino + fragmento normalizado: NFKC, minúsculas, espacios colapsados, cifras → «#», sin
    invisibles; veredicto de mesa propia vigente —`expiresAt` = decidedAt + `FIREWALL_CACHE_TTL_DIAS`,
    def. 30— y con confianza ≥ 0,7) → **espera** (mesa del mismo patrón en curso: la fila hereda su
    veredicto al cerrar) → **tope** `FIREWALL_MAX_POR_TENANT_DIA` (def. 50, día UTC; caché y espera no
    cuentan) → mesa nueva. Las filas de caché/espera no guardan fragmento ni user-agent.
  - **Cierre**: el tick (`/api/engine/tick`), si el dominio es `firewall`, marca la fila `running`
    antes de procesar y, al terminar la sesión, escribe el veredicto y lanza el primer webhook
    (`finalizarRevisionDeSesion`). Red de seguridad: cron **`/api/cron/firewall`** (`*/5`) cierra las
    que nadie cerró (sesiones abandonadas por la bomba: ventana de 60 min en `bomba.ts`), reintenta
    avisos y, pasado el TTL, borra `detail`/`userAgent` de las filas y **purga la traza** de sesiones del
    dominio (`purgeClosed`). No se registran fragmentos en logs.
  - **Contrato de entrada** (no cambiarlo sin avisar a wp-next-starter): `POST /api/v1/firewall/revisar`,
    `Authorization: Bearer LA_BANDA_API_KEY`, JSON `{ kind: "agent-quarantine", logId: cuid|null,
    tenantId, host, target: "/api/agent/…" | "mcp:<herramienta>", reason: prompt-injection |
    exfiltration | arg-unexpected | unknown-tool | hidden-chars | param-schema | param-anomalous,
    detail?: ≤300, userAgent?: ≤200, createdAt: ISO }` (campos extra ignorados; detail/userAgent se
    recortan). Respuestas: 401 sin Bearer, 400 cuerpo inválido, 429 `{error:"rate-limited",limit}`, 503
    sin modelo, **202** `{ id, status: "queued" }` o `{ id, status: "cached", verdict, confidence,
    rationale, patternKey, cached: true, decidedAt }`. Lógica en `src/lib/firewall/api.ts`
    (testeable sin Next ni BD).
  - **Contrato de salida**: `GET /api/v1/firewall/revisar/<id>` (mismo Bearer) →
    `{ id, logId, tenantId, status: queued|running|done|failed, verdict: benign|malicious|null,
    confidence, rationale, patternKey, cached, failClosed, decidedAt }`. **Webhook**: con `WORDNEXT_CALLBACK_URL` +
    `WORDNEXT_CALLBACK_SECRET`, al terminar una mesa (y a las revisiones en espera) POST de ese mismo
    JSON con `X-Banda-Signature: sha256=<hex HMAC-SHA256(secreto, cuerpo exacto)>`; 2xx = entregado;
    reintentos del cron con el backoff de peticiones (1, 5, 15, 60 min; 12 intentos o 24 h). Sin URL o
    sin secreto no se envía nunca sin firma (queda el GET). Las respuestas de caché no generan webhook.
  - Panel: pestaña **Firewall** (`FirewallCard`, sin fragmento ni user-agent).
  - Envs nuevas: `WORDNEXT_CALLBACK_URL`, `WORDNEXT_CALLBACK_SECRET` y opcionales
    `FIREWALL_MODELO_MESA`, `FIREWALL_MODELO_JUEZ`, `FIREWALL_CACHE_TTL_DIAS`,
    `FIREWALL_MAX_POR_TENANT_DIA`. Requiere `ANTHROPIC_API_KEY`. El receptor del webhook en
    wp-next-starter va en otro PR.

- **2026-09-27, firewall: FAIL-CLOSED (v0.10.1)**. Al repasar la Fase 2b contra la especificación de Javier
  («si la Banda no responde o se agota maxSteps, el veredicto es veto») faltaba: una mesa fallida (error del
  modelo, tope de pasos, sesión abandonada por la bomba, mesa que no se pudo abrir) dejaba la revisión `failed`
  SIN veredicto. Ahora `falloCerrado` (`src/lib/firewall/veredicto.ts`) la cierra como `failed` + `verdict:
  malicious` + `confidence: 0` + razón «Bloqueo por fallo (fail-closed): …»; lo heredan las revisiones en espera.
  El contrato de salida (GET y webhook) gana **`failClosed: boolean`** (`status === 'failed'`) para que WordNext lo
  distinga de un ataque juzgado («bloqueo por fallo»). Nunca entra en la caché (exige `done` y confianza ≥ 0,7),
  así que el patrón vuelve a mesa la próxima vez. Las métricas cuentan como «maliciosas» solo las juzgadas.
  Test en `firewall-api`. Decidido por AskUserQuestion: «veto marcado».

- **2026-09-28, estado para el panel de WordNext (v0.11.0)**. Javier quiere ver La Banda integrada en el Inicio de su
  panel de superadmin de WordNext («resumen en vivo + enlace», decidido por AskUserQuestion). Nuevo
  **`GET /api/v1/estado`** (mismo Bearer `LA_BANDA_API_KEY`, `no-store`): sesiones de los últimos 7 días por dominio
  (abiertas, cerradas, vetadas, fallidas, última), las 8 últimas y las 5 últimas fallidas, y el firewall de 30 días
  (en revisión, ataques, falsos positivos, bloqueos por fallo, desde caché) + `panelUrl` (`APP_URL` + `/panel`).
  **Solo cifras, ids, dominios, estados y fechas**: nunca traza, informes finales ni fragmentos del firewall. Agregado
  puro en `src/lib/estado.ts` (`resumirEstado`, test `tests/estado.test.ts`). Sin esquema ni variables nuevas. Lo
  consume wp-next-starter (1.76.0) con `LA_BANDA_URL` + `LA_BANDA_API_KEY`, que ya tiene.

- **2026-09-28, red de webs agénticas — Fase 4a: registro de nodos y negociación B2B (v0.12.0)**. Javier reactivó la
  red B2B (antes en espera) y decidió por AskUserQuestion: **registro centralizado ahora** (solo webs WordNext) **y
  federado después**; **identidad = todo pasa por La Banda con credencial por nodo** (sin firma asimétrica mientras no se
  federe); **MVP = solo solicitud de presupuesto** sobre el catálogo real del vendedor, en euros y céntimos.
  **Requiere SQL en Neon ANTES de desplegar** (`scripts/negociacion.sql`, idempotente; o `drizzle/0007_negociacion.sql`):
  tablas `red_nodos` y `red_negociaciones`.
  - **Principios**: ningún acuerdo es firme sin la **aprobación humana de las dos partes**; cada mesa negocia SOLO dentro
    de los límites de su dueño; **determinista primero** (esquema, credenciales, límites, turnos y propuesta en código;
    el LLM solo redacta y elige dentro del margen); un mensaje que intenta manipular al agente contrario **veta**;
    Anthropic por defecto (`NEGOCIACION_MODELO_MESA` def. Sonnet 5, `NEGOCIACION_MODELO_JUEZ` def. Opus 5.5; sin la
    clave del proveedor nombrado → 503, nunca z.ai por defecto); sin transacciones.
  - **Nodos** (`src/db/negociacion.ts`, `src/lib/negociacion/ciclo.ts`): alta por tenant con host, sector, capacidades
    (`quote`), catálogo (`precioCents` de lista y `minimoCents` PRIVADO por item) y límites (`descuentoMaxPct` 0-90,
    `rondasMax` 1-10). El alta devuelve **una vez** la clave del nodo (`bn_…`; se guarda su sha256); actualizar,
    rotar, dar de baja y actuar en su nombre exige `x-banda-nodo-clave` (+ `x-banda-nodo` con el id). Descubrimiento por
    capacidad y sector con ficha pública (sin mínimos ni límites).
  - **Reglas** (`reglas.ts`, puras): suelo por unidad = max(mínimo propio, lista − descuento máximo); el vendedor oferta
    precio por CADA línea entre su suelo y su lista y solo `rondasMax` veces; el comprador acepta si cabe en su
    presupuesto o contraoferta por debajo de la oferta y de su presupuesto; zona de acuerdo = suma de suelos ≤
    presupuesto; `detectarInyeccion` (es/en: ignorar instrucciones, prompt de sistema, marcas de chat, cambio de rol,
    «revela tu mínimo», «acepta cualquier precio», jailbreak, invisibles). Al abrir, **inyección en la solicitud → vetada
    sin mesa** y **sin zona de acuerdo → sin_acuerdo sin mesa** (ni una llamada a un modelo, y sin revelar el mínimo).
  - **Dominio `negociacion`** (`domains/negociacion/`): Palermo (cortafuegos, entrada y veto) → Berlín (mesa del
    VENDEDOR: `leerComoVendedor` + `ofertar`) → Profesor (árbitro: `comprobar`, DETERMINISTA) → Lisboa (mesa del
    COMPRADOR: `leerComoComprador` + `responder`) → Profesor → … → Helsinki (`registrarPropuesta`, la compone el código
    desde la oferta aceptada, y cierra) o Palermo (veto). Cada mesa ve solo SUS límites; los mensajes y la solicitud de
    la otra parte van delimitados como dato no fiable. El código lleva el **turno**, cuenta los movimientos que el
    árbitro ha visto (`ofertasVistas`: si la parte a la que le tocaba no hizo un movimiento válido —p. ej. insistió
    por debajo de su mínimo— se veta) y fija el **desenlace** (`propuesta` | `sin_acuerdo` | `vetada`); al terminar la
    mesa, `finalizarNegociacion` (hook del tick + cron) lo aplica y **re-valida** la propuesta. Estados: `negociando` →
    `propuesta` → `acordada` | `rechazada`, o `sin_acuerdo` | `vetada` | `fallida`. Propuesta sin aprobar caduca a los 7
    días; mesa colgada se abandona a los 90 min (cron `/api/cron/negociacion`, cada 5 min).
  - **API v1** (Bearer `LA_BANDA_API_KEY` + credencial del nodo): `POST /api/v1/red/nodos` (alta 201 + `clave` / 200
    actualización), `GET /api/v1/red/nodos?capacidad=&sector=&limite=`, `DELETE /api/v1/red/nodos/:id`,
    `POST /api/v1/negociacion` (el comprador abre; 202 con el estado), `GET /api/v1/negociacion/:id` (solo las dos
    partes; `tuParte`), `POST /api/v1/negociacion/:id/aprobar|rechazar`. Contrato JSON en la descripción del PR (lo
    usará la Fase 4b). **Nunca** salen el presupuesto del comprador ni los mínimos/descuento/rondas del vendedor.
  - **Aviso** (`webhook.ts`): mismo mecanismo que la Fase 2b: POST con el JSON del GET + `evento`, firmado
    `X-Banda-Signature: sha256=HMAC(WORDNEXT_CALLBACK_SECRET, cuerpo)`, a `NEGOCIACION_CALLBACK_URL` o, por defecto, el
    origen de `WORDNEXT_CALLBACK_URL` + `/api/la-banda/negociacion`; reintentos con el backoff de peticiones. Sin URL o
    sin secreto no se envía (queda el GET).
  - Tests con fixtures (`tests/negociacion.test.ts`, `tests/negociacion-api.test.ts`): acuerdo con dos rondas y
    aprobación de las dos partes; sin zona de acuerdo; rondas agotadas; vendedor por debajo de su mínimo (rechazado y
    vetado; si corrige, sigue); aceptación por encima del presupuesto; inyección en un mensaje y en la solicitud;
    privacidad de límites; aviso firmado; nodos; caducidad; API.

- **2026-09-28, marketing — Fase 3: dominio `marketing` (v0.13.0)**. Hoja de ruta del doc «WordNext — Definición de
  producto y trazabilidad» (fase 3: «dominio marketing en La Banda, Fable + revisión humana»). Decidido por AskUserQuestion:
  **solo artículos de blog** (las redes llegan en las fases 11-12, cuando haya cuentas y apps de Meta/TikTok); **La Banda
  propone temas y Javier los aprueba**; cada artículo **en ES + EN enlazados**; fuentes = **ficha de hechos + búsqueda web
  (Anthropic por defecto, z.ai configurable, nunca por defecto)**; y, a mitad de trabajo, **revisión semanal en domingo**.
  **Requiere SQL en Neon de LA BANDA ANTES de desplegar** (`scripts/marketing.sql`, idempotente; o
  `drizzle/0008_marketing.sql`): tablas `marketing_temas` y `marketing_piezas`. Necesita wp-next-starter 1.80.0
  (`locale` + `translationKey` en la API de publicación).
  - **Calendario (hora de Madrid, `src/lib/marketing/calendario.ts`, puro)**: el cron `/api/cron/marketing` (`40 * * * *`)
    propone temas el **jueves** (desde las 07:00; si esa semana no hubo plan y quedan menos propuestos que la cadencia);
    de **jueves a sábado** redacta los temas APROBADOS, uno a la vez por destino, para la **semana siguiente** (huecos:
    martes y jueves a las 09:00 con `MARKETING_ARTICULOS_SEMANA=2`; 1-5); el **domingo a las 08:00** manda el **resumen de
    revisión** por Brevo a `MARKETING_REVISOR_EMAIL` (def. informa@blablaele.com; javier@ no existe): artículos por aprobar
    en WordNext (enlaces de revisión ES/EN), temas propuestos (enlace al panel) y los que necesitan decisión. Además abandona
    mesas colgadas (3 h) y purga la traza de 90 días.
  - **Dominio** (`domains/marketing/`): dos tipos de sesión en un solo grafo. **plan**: Tokio (propone) → Denver (contrasta
    con búsquedas) → Palermo (filtra) → Helsinki (`registrarTemas`). **articulo**: Tokio (esquema) → Denver (datos con fuente
    y fecha) → **Río (redacta en español con Fable, `MARKETING_MODELO_REDACTOR` def. `claude-fable-5-1`)** → Estocolmo
    (versión inglesa) → Palermo (rúbrica: aprueba, devuelve a Río/Estocolmo o veta; `MARKETING_MODELO_JUEZ` def. Opus 5.5)
    → Helsinki (`enviarArticulo`, cierra). Resto de mesas `MARKETING_MODELO_MESA` (def. Sonnet 5). Sin prefijo = `anthropic:`;
    sin la clave del proveedor no se abre mesa.
  - **Hechos** (`src/lib/marketing/hechos.ts`): única fuente de precios, planes y funciones de WordNext; se mantiene a mano
    al cambiar precios (deben coincidir con wp-next-starter y el escaparate). Palermo veta lo que no esté ahí; incluye lo que
    NO se puede decir (clientes, testimonios o porcentajes inventados, promesas de posición, funciones que aún no existen).
  - **Búsqueda** (`busqueda.ts`, herramienta `buscarWeb` de Denver, máx. 3 por sesión): llamada aparte con la herramienta de
    servidor `web_search_20260209` (`MARKETING_MODELO_BUSQUEDA`, def. Sonnet 5) → resumen + fuentes que abrió el buscador;
    `MARKETING_BUSQUEDA=zai` usa la de z.ai, `ninguna` la apaga. El resumen llega delimitado como DATO_NO_FIABLE.
  - **Validación dura en código** (`articulo.ts`): temas (categoría de la lista —las 8 del escaparate + `firewall-ia` +
    `migracion`—, longitudes, sin repetir) y artículo (título, slug, extracto, SEO, HTML solo con h2/h3/p/listas/strong/em/
    a https/blockquote/br, sin h1, ≥ 2 h2, 600-2.500 palabras). **`enviarArticulo` exige la aprobación de Palermo** y las dos
    versiones válidas; manda ES y EN a WordNext (`wordnext.ts`: firma de plataforma HMAC de `<ts>.<MÉTODO>.<ruta>.<cuerpo>`
    con `WORDNEXT_CALLBACK_SECRET`, `fetchLimpio`; origen `WORDNEXT_PUBLISH_URL`, `WORDNEXT_URL` o el de `WORDNEXT_CALLBACK_URL`) como **borradores
    programados** con `externalRef` `lb-mkt.<tema>.v<versión>.<idioma>` (idempotente) y la misma `translationKey`.
  - **Vuelta** `POST /api/v1/marketing/publicaciones` (la URL que wp-next-starter ya usa por defecto: origen de
    `LA_BANDA_URL`): Bearer `LA_BANDA_API_KEY` + `X-Banda-Signature` del cuerpo exacto. Estado del tema por sus piezas:
    las dos publicadas → `publicado`; una rechazada → `rechazado` con el motivo; retirada → `fallido`.
  - **Estados del tema**: propuesto → aprobado | descartado; aprobado → redactando → en_revision → publicado | rechazado;
    redactando → vetado | fallido (hook del tick `finalizarSesion` + red en el cron). Rechazado, vetado o fallido →
    «Reescribir» (versión + 1, la nota o el motivo llegan a la mesa) o «Descartar».
  - **Panel**: pestaña **Marketing** (`MarketingCard`): temas propuestos con Aprobar/Descartar y nota, los que necesitan
    decisión, en marcha (fecha prevista y enlaces «revisar»/«ver» de WordNext) y botones «Proponer temas ahora» /
    «Redactar el siguiente aprobado» (saltan el calendario).
  - **Prueba de punta a punta** (wp-next-starter 1.80.0 con `next start` + rama de Neon; lado La Banda con el código real
    de `ciclo.ts`/`wordnext.ts` y un receptor local con la lógica de la ruta, almacén en memoria; **sin modelos**: el
    contenedor no tiene clave de Anthropic): dos temas aprobados → huecos martes 06-10 09:00; envío ES+EN = 4 borradores con
    `locale` y la misma `translationKey`; reenvío idempotente; web inexistente → 404 legible; firma mala → 401. Aprobadas
    las dos versiones del primero y el cron de WordNext → **avisos firmados** → tema `publicado`; en el blog, «Read in
    English» / «Leer en español» cruzados con `hreflang`. Rechazado el segundo → aviso con motivo → tema `rechazado`. Datos
    de prueba borrados. **Sin probar aquí**: los agentes con modelos reales (Fable/Opus/Sonnet) y el correo del domingo por
    Brevo. Tests `tests/marketing.test.ts` (18).
  - **Checklist para Javier**: (1) pegar `scripts/marketing.sql` en Neon de **La Banda**; (2) fusionar antes
    elcorreveidile/wp-next-starter#204; (3) variables en Vercel de la-banda: nada obligatorio nuevo (el origen de WordNext sale de
    `WORDNEXT_URL` o, si no está, de `WORDNEXT_CALLBACK_URL`; firma con `WORDNEXT_CALLBACK_SECRET`; modelos con
    `ANTHROPIC_API_KEY`); opcionales `MARKETING_*` (ver `.env.example`);
    (4) en WordNext, la ficha de `blog.wordnext.tech` ya tiene «Aceptar artículos de La Banda».

- **2026-09-28, marketing: el Profesor cierra cada mesa (v0.13.1)**. Javier vio en el panel solo 6 agentes y
  pidió el Profesor. Ahora cierra las dos sesiones: Helsinki registra o envía, añade `envio` { resultado, motivo,
  detalle } y pasa → **Profesor** (`closer`, `maxSteps` 16 → 22 en 0.13.4, `MARKETING_MODELO_MESA`), que con `leerCadena` (el
  recorrido SIN contenido: traspasos, motivos de devolución, eventos; el dossier ya lo tiene en su carga) cierra con
  `{ resultado, motivo, informe: { resumen, fuentes, objeciones, revisar, devoluciones } }`. **No decide ni cambia
  nada**: lo enviado ya está enviado; si el Profesor falla, el tema no se toca. El informe se lee del `finalReport`
  de la sesión (`src/lib/marketing/informe.ts`: `leerInforme` sanea —solo fuentes https, topes— y
  `resultadoDeCierre` lee el motivo también del `envio` de Helsinki), **sin columnas nuevas ni SQL**. Sale en el
  **correo del domingo** (bajo cada artículo; el del plan, encima de los temas propuestos) y en la pestaña
  Marketing (plegado: «Informe del Profesor · N puntos que mirar»). Tests en `tests/marketing.test.ts`.

- **2026-09-28, marketing: «Aprobar» no hacía nada (v0.13.2)**. Javier pulsaba Aprobar en los temas propuestos y la
  página volvía igual, sin error; los logs de Vercel mostraban el POST con su 303. La lógica guardaba bien (probada
  contra una rama de Neon); el fallo era el formulario: un solo `action` para Aprobar y Descartar que leía el botón
  pulsado de `formData.get('decision')`, y la decisión llegaba VACÍA (comprobado con Chromium: el envío de la acción de servidor no incluye el botón pulsado)
  → la acción redirigía en silencio. **Regla: una acción de servidor por botón (`formAction`), nunca decidir por el
  name/value del botón**. Ahora `aprobarTemaMarketing` / `descartarTemaMarketing` / `reescribirTemaMarketing` y el
  componente cliente `BotonTema` («Aprobando…» mientras procesa); un aprobado se queda en su sitio con «✓ Aprobado ·
  se redacta de jueves a sábado» y se puede descartar. «Redactar el siguiente aprobado» dice la causa concreta cuando
  no abre mesa (`porQueNoRedacta`: claves, redacción en curso, sin aprobados o semana completa).

- **2026-09-28, marketing: ángulo largo se recorta (v0.13.3)**. El primer plan real registró 3 de 4 temas: el de
  firewall-ia traía un ángulo de más de 400 caracteres y `validarTemas` lo descartaba. Ahora se **recorta** a 400
  (`recortar`, `articulo.ts`: por el último espacio, con «…») y el tema entra; solo se descarta si tiene menos de 20.

- **2026-09-28, marketing: Palermo lee el artículo con una herramienta (v0.13.4)**. En el primer artículo real
  («carta y reservas sin plugins») Palermo devolvió dos veces a Río diciendo que no le llegaba `articuloEs` y que
  el texto pasaba de 1.600 palabras «a ojo». Nueva herramienta **`revisarArticulos`** (Palermo y Estocolmo;
  `articulosDelDossier` en `articulo.ts`, puro): las versiones MÁS RECIENTES con texto de `articuloEs` y
  `articuloEn` de toda la sesión (no solo del traspaso; ignora un campo pisado sin `html`), con las **palabras
  contadas en código** y los errores de la validación del envío. Palermo juzga ese texto y ese recuento; la longitud
  se mide en el español (el inglés ±15 %, y un exceso < 10 % no es motivo de devolución). Estocolmo lee el español con
  ella y no escribe nunca `articuloEs`. `maxSteps` sube a 22 (con tres devoluciones de Palermo la mesa llegaba al tope de 16).

- **2026-09-28, marketing — Fase 4: perfil por destino y primer escaparate (v0.14.0)**. Javier arrancó la Fase 4 de la hoja de
  ruta de producto «poco a poco»: primero `restaurante.wordnext.tech`, un **restaurante de EJEMPLO** («Taberna del Olivar»,
  wp-next-starter 1.81.0), con **1 artículo por semana** al principio y rondas de jueves a sábado como el resto. Cada destino
  tiene ahora un **perfil** (`perfilDestino`, `src/lib/marketing/config.ts`): nombre, **público**, **categorías permitidas**,
  **ritmo propio** (`porSemana`), **cierre** ES/EN y **notas**. El restaurante: público = dueños y gerentes de hostelería,
  solo `restauracion`, 1/semana, cierre hacia `app.wordnext.tech/crear?tpl=restaurante`, y la regla de que Taberna del Olivar
  **no existe** (nunca se presenta como real). El blog de WordNext conserva lo de antes (todas las categorías, un tema de
  firewall de IA cuando se pueda). Lo leen los agentes en `leerEncargo` (`perfil`) y el código: `validarTemas` descarta las
  categorías que no son del destino, `articulosPorSemana`/`temasPorPlan` y los huecos van por destino. **Destinos por defecto**:
  `blog.wordnext.tech,restaurante.wordnext.tech` (`DESTINOS_POR_DEFECTO`; si Vercel tiene `MARKETING_DESTINOS`, hay que añadir el
  restaurante ahí). Panel y correo del domingo muestran el destino de cada tema. Tests en `tests/marketing.test.ts`.
  **Longitud** (en el mismo PR, tras el veto de «Qué necesita de verdad una tienda online pequeña…»: Río entregó 1.962 y
  luego 1.810 palabras y Palermo vetó con todo lo demás correcto): Río apunta a **1.100-1.400** (el tope sigue en 1.600) y
  tiene `revisarArticulos` para ver el recuento de su versión anterior y recortar lo que falte; y **la longitud sola nunca es
  motivo de veto** (el envío admite hasta 2.500): si tras una devolución sigue larga y lo demás cumple, Palermo aprueba y lo
  anota con el recuento para Javier.
  **Checklist**: (1) pegar antes el SQL del escaparate en WordNext (wp-next-starter#205); (2) revisar `MARKETING_DESTINOS` en Vercel;
  (3) el tema vetado de la tienda online se recupera con «Reescribir» tras desplegar.

- **2026-09-28, payload que llega como texto (v0.14.1)**. El artículo «carta y reservas sin plugins» del restaurante
  agotó los 22 traspasos: Estocolmo entregaba `articuloEn` como una CADENA con JSON en vez de objeto (`decide` validaba
  `payload` con `z.unknown()`), el motor la guardaba tal cual, `revisarArticulos` no la encontraba y Palermo la devolvió
  ocho veces. Ahora **`parseDecision` normaliza el payload** (`normalizarPayload`, `src/engine/decision.ts`): un texto con
  forma de JSON se convierte en objeto (reparando saltos de línea en crudo dentro de las cadenas) y, si no se puede leer,
  la decisión se rechaza y el agente reintenta. Además `articulosDelDossier` y el envío de Helsinki (`ultimo`/`erroresDe`)
  aceptan traspasos o campos que ya llegaron como texto. La ficha de hechos gana `guardianEn`
  (`https://www.wordnext.tech/en/guardian`), que Palermo rechazaba por no estar en ella. Vale para todos los dominios.

- **2026-09-28, ficha de hechos: carta y aforo (v0.14.2)**. Palermo tachaba en el artículo del restaurante funciones que
  la ficha no tenía. WordNext las implementa (wp-next-starter#206, 1.82.0: bloque «Carta» con alérgenos, distintivos y
  «agotado»; reservas con aforo y nº de personas) y la ficha las recoge, junto con lo que ya existía y no estaba (horario
  semanal por servicio, confirmación al momento sin señal, recordatorio). También aclara que el migrador trae el contenido y
  que conservar diseño y URLs es el servicio de reconstrucción. **Fusionar DESPUÉS de desplegar wp-next-starter#206.**

- **2026-09-28, marketing: destino de la academia de La Clase Digital (v0.15.0)**. Segundo escaparate de la Fase 4 y primero
  REAL (wp-next-starter#207, 1.83.0): la academia de Javier en `laclasedigital.wordnext.tech` (→ academia.laclasedigital.com)
  con el curso «Monta y vende tu web (para profes)», 49 €. Perfil propio (`perfilDestino`, también bajo el dominio propio):
  público = profesores de idiomas y formadores, solo categoría `docencia`, **1 artículo por semana**, cierre hacia el curso
  (`/curso`, `/en-course` en inglés) y la regla de NO inventar alumnos, anécdotas ni resultados de Javier. Entra en
  `DESTINOS_POR_DEFECTO`; si Vercel tiene `MARKETING_DESTINOS`, hay que añadir `laclasedigital.wordnext.tech`. Fusionar
  DESPUÉS de pegar el SQL de la academia en WordNext (si no, el envío da 404 y el tema queda «fallido»).

- **2026-09-29, Anthropic APAGADO: todo por z.ai (v0.16.0)**. Javier: «Tenemos que dejar de usar la API de Anthropic para la
  banda y demás usos de IA… mientras esté todavía en pruebas y no tenga clientes reales, la API de Z.ai… gasto excesivo».
  **Revierte** «Anthropic por defecto / z.ai nunca por defecto» del firewall, la negociación y el marketing mientras dure.
  Un solo interruptor en `src/engine/provider.ts`: **`ANTHROPIC_ACTIVO=1`** enciende Anthropic; sin él, `ANTHROPIC_API_KEY` se
  ignora aunque esté puesta (tampoco `DEFAULT_PROVIDER=anthropic`) y **`modeloEfectivo`** pasa todo modelo `anthropic:…` o
  `claude-…` a `zai:<ZAI_MODEL, def. glm-5.3>`. Lo usan `providerFor` (todos los dominios, también `CORPUS_MODELO_REDACTOR`), los
  modelos del firewall, la negociación y el marketing (`conProveedor`; Fable/Opus/Sonnet → GLM) y `modelosDisponibles`
  (`hayClavePara`: ahora basta `ZAI_API_KEY`); la búsqueda web de marketing pasa a z.ai. Mismo interruptor en wp-next-starter
  (1.90.3). Para volver a Anthropic cuando haya ingresos: `ANTHROPIC_ACTIVO=1` en Vercel (nada de código).

- **2026-09-29, marketing: destino de la clínica de fisioterapia de ejemplo (v0.17.0)**. Tercer escaparate de la Fase 4
  (wp-next-starter 1.91.0): `servicios.wordnext.tech`, «Fisioterapia Alameda», clínica FICTICIA con reservas con agenda. Perfil
  propio: público = fisioterapeutas y dueños de consultas de salud y bienestar, solo categoría `salud`, **1 artículo por semana**,
  cierre hacia `app.wordnext.tech/crear?tpl=profesional` y dos reglas: no presentarla como real ni inventar pacientes o
  resultados, y escribir para el PROFESIONAL (citas, recordatorios, reseñas), **nunca consejos médicos**. Entra en
  `DESTINOS_POR_DEFECTO`; si Vercel tiene `MARKETING_DESTINOS`, añadir `servicios.wordnext.tech`. Fusionar DESPUÉS de pegar
  `scripts/escaparates/servicios.sql` en WordNext (si no, el envío da 404 y el tema queda «fallido»).

- **2026-09-29, marketing: destino de la tienda ecológica de ejemplo (v0.18.0)**. Cuarto escaparate de la Fase 4
  (wp-next-starter 1.92.0): `tienda.wordnext.tech`, «La Despensa Verde», tienda FICTICIA con productos y extras. Perfil propio:
  público = dueños de tiendas pequeñas y comercios de proximidad, solo categoría `comercio`, **1 artículo por semana**, cierre
  hacia `app.wordnext.tech/crear?tpl=tienda` y dos reglas: no presentarla como real ni inventar clientes o ventas, y escribir para
  el DUEÑO de la tienda (fichas, envíos, pagos, devoluciones), nunca recetas ni consejos de salud. Entra en `DESTINOS_POR_DEFECTO`;
  si Vercel tiene `MARKETING_DESTINOS`, añadir `tienda.wordnext.tech`. Fusionar DESPUÉS de pegar `scripts/escaparates/tienda.sql`
  en WordNext (si no, el envío da 404 y el tema queda «fallido»).

- **2026-09-29, marketing: blogs de La Banda y de jblainez.es, solo en español (v0.19.0)**. Javier: «que La Banda escriba para
  banda.wordnext.tech y jblainez.es» (las dos webs pasaron a negocio en wp-next-starter 1.93.0: precios + videollamada de La Banda y
  el taller de poesía de 49 €/149 €). Dos destinos nuevos con perfil propio, **1 artículo por semana** y **solo en español**:
  `PerfilDestino.idiomas` (sin valor = español e inglés, como hasta ahora; `idiomasDestino`). Con `['es']`, Estocolmo pasa sin
  traducir, `revisarArticulos` no trae el inglés, Palermo no lo exige, `enviarArticulo` manda una sola pieza sin `translationKey` y
  el tema queda publicado con esa pieza (`estadoPorPiezas(piezas, esperadas)`). `PerfilDestino.hechos`: datos propios del destino
  (precios de La Banda, el taller) que Palermo comprueba como la ficha de WordNext. Categorías nuevas `agentes-ia` y `escritura`,
  solo de sus destinos (el blog de WordNext no las propone). **banda.wordnext.tech**: público = pymes y despachos con procesos
  repetitivos; cierre hacia /reservar-llamada o /precios; nunca clientes, ahorros ni porcentajes inventados (los casos reales son
  las bandas en producción; el trading es SIMULADO). **javier.wordnext.tech** (también `www.jblainez.es`): público = quien escribe
  poesía; cierre hacia /cursos-de-poesia; ni anécdotas ni alumnos inventados, ni poemas de Javier; poemas enteros solo de dominio
  público, del resto ≤ 4 versos con autor y título. **Checklist para Javier**: (1) en Neon de WordNext, abrir las dos webs a La Banda
  (`publish_banda`); (2) si Vercel de la-banda tiene `MARKETING_DESTINOS`, añadir `banda.wordnext.tech,javier.wordnext.tech`.

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
6. Firewall agéntico de WordNext, carril profundo (Fase 2b) — **hecho** (v0.10.0).
7. Red de webs agénticas, registro y negociación B2B (Fase 4a) — **hecho** (v0.12.0). Fase 4b en wp-next-starter.
8. Marketing de WordNext (Fase 3 de la hoja de ruta de producto): dominio `marketing` — **hecho** (v0.13.0; Profesor en v0.13.1).
