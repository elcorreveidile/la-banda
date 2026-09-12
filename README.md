# La Banda

Sistema de diez agentes con roles fijos, veto obligatorio y traspasos
trazables. Dos dominios intercambiables: mesa de trading simulada y
redacción de *Olvidos de Granada*. Nombre provisional.

**Estado: fase 1** (motor y log). Todavía no hay ningún dominio real: solo
`domains/toy`, con dos agentes (Tokio propone, Palermo veta), para probar el
motor.

## Stack

Next.js 15 (App Router) · TypeScript · Drizzle sobre Neon (`neon-http`) ·
Auth.js v5 con enlace mágico por Resend · API de Anthropic · Tailwind ·
Vitest. Despliegue en Vercel.

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
  index.ts          registro: getDomain(), listDomains()
src/db/             esquema Drizzle (agents, sessions, tasks, handoffs, events + tablas auth_*)
src/engine/
  orchestrator.ts   bucle: lee traspasos pendientes, invoca al destinatario, aplica su decisión
  runAgent.ts       llamada a Anthropic con el prompt del agente y SOLO sus herramientas
  decision.ts       esquema de la decisión { action, to, payload, reason }
  store.ts          interfaz de persistencia (EngineStore) · dbStore.ts la implementa
src/app/panel/      panel: cabecera, lanzador de sesiones, lista y log en vivo
src/app/login/      acceso por enlace mágico (solo correos de ALLOWED_EMAILS)
tests/              orquestador con almacén en memoria y agentes de guion
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
