# La Banda

Sistema de diez agentes con roles fijos, veto obligatorio y traspasos
trazables. Tres dominios intercambiables: mesa de trading simulada, redacción
de *Olvidos de Granada* y corpus ELE «un semestre en Granada». Nombre provisional.

**Estado: fase 5** (corpus ELE). Dominios: `domains/toy` (dos agentes, para
probar el motor), `domains/trading` (los diez roles, velas reales de BTC/USD y
ETH/USD, cartera ficticia de 100 USD, ciclo horario por cron), `domains/olvidos`
(redacción de *Olvidos de Granada*: informe de objeciones y veredicto sobre un
manuscrito) y `domains/corpus-ele` (muestras de habla niveladas por el PCIC y
anotación de producciones de alumnos contra la API de la Clínica Cultural).

## Stack

Next.js 15 (App Router) · TypeScript · Drizzle sobre Neon (`neon-http`) ·
Auth.js v5 con enlace mágico por Brevo · agentes por z.ai (GLM, endpoint
compatible con el SDK de Anthropic; fallback a la API de Anthropic) · Tailwind ·
Vitest. Despliegue en Vercel con cron horario.

## Arranque local

```bash
npm install
cp .env.example .env.local   # rellenar
npm run db:push              # crea las tablas en Neon (o aplica drizzle/0000_inicial.sql)
npm run dev                  # http://localhost:3000/panel
```

Validación antes de subir: `npm run lint && npm run typecheck && npm test && npm run build`.

## Estructura

```
domains/            configuración de dominios (el motor no sabe nada del contenido)
  types.ts          DomainConfig, AgentConfig, AgentDecision, ToolDef, validateDomain()
  toy/config.ts     dominio de prueba: Tokio → Palermo
  trading/          config.ts (diez agentes, grafo) · tools.ts (getCandles, getPortfolio, now, webSearch, writeLedger, readAll)
  olvidos/          config.ts (diez agentes, grafo) · tools.ts (readManuscript, readStyleSheet, getSectionLimits, webSearch, writeLedger, readAll)
                    hojaDeEstilo.ts (PROPUESTA) · secciones.ts (límites por sección, PROPUESTA)
  corpus-ele/       config.ts (diez agentes, dos tareas: muestra | produccion) · tools.ts (leerEtiquetario, leerPcic, buscarPiezas, medirNivel, webSearch, escribirPieza, escribirAnotaciones, readAll)
  index.ts          registro: getDomain(), listDomains()
src/db/             schema.ts (motor + auth_*) · trading.ts (prices, portfolio, orders_sim) · olvidos.ts (manuscripts, versions, objections)
src/engine/
  orchestrator.ts   step(): un traspaso → una invocación; runSession() los encadena
  runAgent.ts       llamada al modelo con el prompt del agente y SOLO sus herramientas
  provider.ts       z.ai (GLM) si hay ZAI_API_KEY; si no, Anthropic
  tick.ts           kickTick: lanza un tick (lo usa la bomba src/lib/bomba.ts y quien abre una sesión)
  decision.ts       esquema de la decisión { action, to, payload, reason }
  store.ts          interfaz de persistencia (EngineStore) · dbStore.ts la implementa
src/lib/trading/
  candles.ts        velas horarias: Coinbase Exchange, Kraken de respaldo (sin clave)
  sim.ts            simulación pura: slippage 0,3 %, comisión 0,1 %, stop/objetivo/caducidad
  portfolio.ts      cartera y libro de órdenes sobre la base de datos
  cycle.ts          un ciclo: velas → posiciones abiertas → sesión nueva
  metrics.ts        saldo, operaciones, vetos de Palermo, devoluciones de Lisboa, resultado por operación
src/lib/olvidos/
  manuscripts.ts    manuscritos y versiones (lectura de .md/.txt/.docx con mammoth), objeciones
  metrics.ts        sesiones, veredictos, objeciones por agente, devoluciones de Lisboa
src/lib/clinica.ts  cliente de la API del corpus de la Clínica (CLINICA_URL + CLINICA_CORPUS_KEY; nunca lanza)
src/lib/corpus/
  medir.ts          medidas objetivas de un texto (palabras, frases, marcas por banda) para Estocolmo
  cycle.ts          abrir sesiones muestra/produccion · ciclo diario: pendientes de la Clínica, recover, purga de traza
src/lib/webSearch.ts búsqueda web por la API de z.ai
src/app/api/cron/corpus    GET diario (vercel.json); Bearer CRON_SECRET
src/app/api/cron/tick      GET cada minuto: bomba de ticks (un tick por sesión con traspaso pendiente); Bearer CRON_SECRET
src/app/api/cron/trading   GET horario (vercel.json); Bearer CRON_SECRET
src/app/api/engine/tick    POST; cabecera x-engine-secret; responde 202 y procesa UN paso en after() (no se encadena)
src/app/panel/      panel: cabecera, lanzadores, métricas y gráficos (Recharts), lista de sesiones,
                    SessionLive (avatares con estado + grafo de traspasos con d3 + log en vivo)
src/lib/panel/sessionView.ts  eventos, traspasos y estado de cada agente de una sesión
scripts/olvidos-prueba.ts     prueba §8.3: envía los tres textos de docs/olvidos-prueba y compara veredictos
src/app/login/      acceso por enlace mágico (solo correos de ALLOWED_EMAILS)
tests/              orquestador y dominios con almacén en memoria; simulación y velas
drizzle/            SQL generado (drizzle-kit generate); copiable a Neon
```

## Cómo funciona una sesión

1. `engine.openSession(domain, tarea)` crea `session` + `task` y siembra el
   primer traspaso hacia `domain.entry`.
2. `engine.runSession(domain, sessionId)` toma el traspaso pendiente más
   antiguo, invoca al agente destinatario (`runAgent`) y aplica su decisión:
   `pass` (nuevo traspaso), `return` (nuevo traspaso con motivo), `veto`
   (cierra la sesión como vetada) o `close` (cierra con informe final).
3. Cualquier acción fuera del grafo del dominio (`transitions`, `returns`,
   `canVeto`, `closer`) se rechaza, se registra como `transition_rejected` y
   la sesión se detiene (`failed`). Lo mismo si se supera `maxSteps`.
4. Cada paso escribe un `event` firmado con el `agentId` del agente.

Los agentes no comparten contexto: reciben la tarea, el traspaso que les llega
(con motivo si es una devolución) y sus herramientas. Responden llamando a la
herramienta `decide` una sola vez.

## Ciclo de trading (fase 2)

Cada hora (`5 * * * *`, Vercel cron) `GET /api/cron/trading`:

1. Descarga las últimas 120 velas horarias cerradas de BTC-USD y ETH-USD
   (Coinbase Exchange; Kraken si falla) y las guarda en `prices`.
2. Revisa las posiciones abiertas contra el último cierre: stop, objetivo o
   caducidad → cierre con slippage y comisión, dinero de vuelta a la caja.
3. Abre una sesión del dominio `trading` con la foto de velas y cartera y
   arranca la **cadena de ticks**: cada `POST /api/engine/tick` procesa un
   traspaso (una llamada a un agente) y encadena el siguiente. Ningún agente
   depende del tiempo máximo de una función.

Cadena: Tokio → Denver → Estocolmo → Río → Berlín → Lisboa → Nairobi →
Palermo → Helsinki → Profesor. Tokio, Denver y Estocolmo pueden ir directos
al Profesor cuando no hay nada que operar. Lisboa devuelve a cualquiera de
los anteriores. Palermo veta. Helsinki registra la orden con `writeLedger`, y
es el **código** quien la ejecuta (compra al último cierre, +0,3 % de
slippage, 0,1 % de comisión) o la rechaza. El Profesor cierra con el informe.

Desde el panel, «Lanzar ciclo ahora» hace lo mismo que el cron.

## Redacción de Olvidos (fase 3)

Desde el panel se envía un manuscrito (título, firma, sección de destino y
texto pegado o fichero `.md`/`.txt`/`.docx`). Se guarda como `manuscripts` +
`versions` (v1) y se abre una sesión del dominio `olvidos` que corre por la
cadena de ticks.

Cadena: Tokio (tesis, estructura, extensión) → Denver (lugares comunes) →
Berlín (hoja de estilo → condiciones de aceptación) → Río (tensión y
repeticiones) → Lisboa (datos, nombres, fechas y citas; devuelve si la cadena
no cuadra) → Estocolmo (extensión contra el espacio de la sección) → Nairobi
(objeciones numeradas + informe de una página) → Palermo (veta la publicación
si alguna condición de Berlín no se cumple) → Helsinki (registra objeciones y
decisión con `writeLedger`) → Profesor (veredicto: publicable / con cambios /
rechazado).

**Los agentes señalan, no corrigen**: nunca sale una versión reescrita. Las
objeciones se ven en el panel junto al log de la sesión; el veredicto en el
informe final de la sesión.

La hoja de estilo (`domains/olvidos/hojaDeEstilo.ts`) y los límites por
sección (`domains/olvidos/secciones.ts`) son una **propuesta** sacada del repo
`olvidos` (no había hoja de estilo formal): corregir ahí.

## Panel (fase 4)

- Cabecera: dominio activo, sesión, reloj.
- Fila de diez avatares con estado: inactivo / esperando (traspaso pendiente) /
  trabajando (desde `agent_started`) / hecho.
- Grafo de traspasos (d3): agentes en el orden de la cadena; cada traspaso es un
  arco coloreado por estado (aceptado, devuelto, vetado, pendiente); las
  devoluciones van por debajo.
- Log en vivo, una línea por evento, codename coloreado.
- Métricas del dominio: trading (patrimonio, caja, operaciones, vetos,
  devoluciones, resultado por operación con barras y patrimonio realizado con
  línea, Recharts) y Olvidos (sesiones, veredictos, objeciones por agente).

## Prueba de Olvidos con textos publicados (§8.3)

`docs/olvidos-prueba/` guarda tres textos publicados en olvidosdegranada.es en
marzo de 2026 (los tres se publicaron, así que el veredicto esperado es
«publicable»). En local, con `.env.local`:

```bash
npx tsx --env-file=.env.local scripts/olvidos-prueba.ts            # envía y evalúa (minutos por texto)
npx tsx --env-file=.env.local scripts/olvidos-prueba.ts --comparar  # imprime veredictos y objeciones
```

## API v1 (para Olvidos y por2duros)

Un solo motor, dos escaparates: olvidosdegranada.es y por2duros.com consultan
La Banda **desde su servidor** con `Authorization: Bearer LA_BANDA_API_KEY`
(nunca desde el navegador).

| Ruta | Qué devuelve |
|---|---|
| `GET /api/v1/trading` | reglas, cartera, métricas, operaciones y últimas 24 sesiones con informe final |
| `GET /api/v1/trading/sesiones/:id` | eventos, traspasos y estado de los agentes de una sesión |
| `GET /api/v1/olvidos/manuscritos` | secciones y manuscritos recientes con veredicto |
| `POST /api/v1/olvidos/manuscritos` | `{ title, byline?, section, text, sourceName?, createdBy? }` → guarda, abre sesión, arranca ticks (202) |
| `GET /api/v1/olvidos/manuscritos/:id` | versiones, objeciones numeradas y veredicto |
| `GET /api/v1/corpus` | últimas 50 sesiones del corpus con el cierre del Profesor (nunca la traza) |
| `POST /api/v1/corpus/producir` | `{ situacion, nivel, tipo?, fuente?, licencia?, notas? }` → abre sesión `muestra`, arranca ticks (202) |
| `POST /api/v1/corpus/anotar` | `{ ref, seudonimo, texto, nivel?, consigna?, lenguaMaterna?, origen? }` → abre sesión `produccion` (202) |
