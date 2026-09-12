# La Banda

Sistema de diez agentes con roles fijos, veto obligatorio y traspasos
trazables. Dos dominios intercambiables: mesa de trading simulada y
redacción de *Olvidos de Granada*. Nombre provisional.

**Estado: fase 2** (trading simulado). Dominios: `domains/toy` (dos agentes,
para probar el motor) y `domains/trading` (los diez roles, velas reales de
BTC/USD y ETH/USD, cartera ficticia de 100 USD, ciclo horario por cron).

## Stack

Next.js 15 (App Router) · TypeScript · Drizzle sobre Neon (`neon-http`) ·
Auth.js v5 con enlace mágico por Resend · agentes por z.ai (GLM, endpoint
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
  index.ts          registro: getDomain(), listDomains()
src/db/             schema.ts (motor + auth_*) · trading.ts (prices, portfolio, orders_sim)
src/engine/
  orchestrator.ts   step(): un traspaso → una invocación; runSession() los encadena
  runAgent.ts       llamada al modelo con el prompt del agente y SOLO sus herramientas
  provider.ts       z.ai (GLM) si hay ZAI_API_KEY; si no, Anthropic
  tick.ts           cadena de ticks: /api/engine/tick procesa un paso y se llama a sí mismo
  decision.ts       esquema de la decisión { action, to, payload, reason }
  store.ts          interfaz de persistencia (EngineStore) · dbStore.ts la implementa
src/lib/trading/
  candles.ts        velas horarias: Coinbase Exchange, Kraken de respaldo (sin clave)
  sim.ts            simulación pura: slippage 0,3 %, comisión 0,1 %, stop/objetivo/caducidad
  portfolio.ts      cartera y libro de órdenes sobre la base de datos
  cycle.ts          un ciclo: velas → posiciones abiertas → sesión nueva
  metrics.ts        saldo, operaciones, vetos de Palermo, devoluciones de Lisboa, resultado por operación
src/lib/webSearch.ts búsqueda web por la API de z.ai
src/app/api/cron/trading   GET horario (vercel.json); Bearer CRON_SECRET
src/app/api/engine/tick    POST; cabecera x-engine-secret; responde 202 y procesa en after()
src/app/panel/      panel: cabecera, lanzadores (toy y ciclo de trading), métricas, lista y log en vivo
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
