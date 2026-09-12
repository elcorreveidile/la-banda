# La Banda [|] Brief para Claude Code

Nombre provisional. Sistema de diez agentes con roles fijos, veto obligatorio y traspasos trazables, con dos dominios intercambiables: mesa de trading simulada y redacción de *Olvidos de Granada*.

## 1. Stack (el de Por 2 Duros)

- Next.js 15 (App Router), TypeScript
- Neon + Drizzle
- Auth.js con Magic Link (Resend)
- Vercel (cron para los ciclos de trading)
- API de Anthropic para los agentes
- Recharts para gráficos; d3 solo para el grafo de traspasos

## 2. Principios no negociables

1. **Un trabajo por agente.** Cada agente tiene un prompt de sistema y una lista cerrada de herramientas. El que busca no aprueba; el que aprueba no ejecuta.
2. **Veto obligatorio.** Ninguna acción final (ejecutar orden simulada / marcar texto como publicable) sin aprobación explícita de Palermo.
3. **Ficheros, no memoria.** Los agentes no comparten contexto. Se comunican solo a través de `handoffs`. Cada traspaso lleva remitente, destinatario, carga, estado y hora.
4. **Devolución posible.** Cualquier agente puede devolver el trabajo al anterior con motivo. Lisboa existe para eso.
5. **El Profesor cierra.** Lee la cadena completa y emite el informe final. No decide nada por el camino.
6. **Dominio en configuración.** Roles, prompts y herramientas viven en `/domains/<nombre>/config.ts`. El motor no sabe nada del contenido.

## 3. Modelo de datos (Drizzle)

```
agents      id, domain, codename, role, systemPrompt, tools[], canVeto
sessions    id, domain, startedAt, closedAt, status, finalReport
tasks       id, sessionId, kind, payload(json), status, createdBy
handoffs    id, taskId, fromAgent, toAgent, payload(json),
            status(pending|accepted|returned|vetoed), reason, createdAt
events      id, sessionId, agentId, type, message, createdAt
```

Dominio trading añade: `portfolio`, `orders_sim`, `prices`.
Dominio Olvidos añade: `manuscripts`, `versions`, `objections`.

## 4. Motor

- `orchestrator.ts`: bucle que lee `handoffs` pendientes, invoca al agente destinatario con su prompt + payload, escribe el resultado como nuevo handoff o evento.
- `runAgent(agentId, payload)`: llamada a la API con `system` del agente y `tools` limitadas a su lista. Salida estructurada en JSON: `{ action: "pass" | "return" | "veto" | "close", to, payload, reason }`.
- Reglas de traspaso declaradas en la configuración del dominio: qué agente puede pasar a cuál. Cualquier traspaso fuera del grafo se rechaza y se registra.
- Cada acción produce un `event` con firma del agente.

## 5. Dominio 1: mesa de trading simulada

**Datos:** velas horarias de ETH/USD y BTC/USD desde una API pública sin clave. [No verificado] Comprobar en el momento del desarrollo cuál sigue siendo gratuita (Coinbase Exchange, Kraken, Binance tienen o han tenido endpoints públicos de velas).

**Cartera:** ficticia, 100 USD iniciales. Ejecución contra el precio de cierre de la vela con slippage fijo (0,3 %) y comisión (0,1 %).

**Ciclo:** cron cada hora en Vercel. Cada ciclo es una sesión corta.

| Agente | Trabajo | Herramientas |
|---|---|---|
| Tokio | Detecta configuraciones (volumen sube antes que precio) | `getCandles` |
| Denver | Contrasta con contexto externo; descarta ruido | `getCandles`, `webSearch` |
| Estocolmo | Calcula tamaño de posición según volatilidad | `getPortfolio` |
| Río | Marca niveles de invalidación y salida | `getCandles` |
| Berlín | Redacta condiciones exactas de entrada y salida | ninguna |
| Lisboa | Comprueba frescura de datos; devuelve si están viejos | `getCandles`, `now` |
| Nairobi | Comprime todo en un brief de una página | ninguna |
| Palermo | Veta si falta liquidez, invalidación o brief | ninguna |
| Helsinki | Registra cada orden y cada cambio | `writeLedger` |
| Profesor | Cierra la sesión y redacta el informe | `readAll` |

**Métricas del panel:** saldo simulado, operaciones ejecutadas, vetos de Palermo, devoluciones de Lisboa, resultado por operación.

## 6. Dominio 2: redacción de Olvidos

**Entrada:** un manuscrito (md o docx) más la hoja de estilo de la revista.

**Salida:** informe de redacción con objeciones numeradas y veredicto. Nunca una versión reescrita del texto: los agentes señalan, no corrigen.

| Agente | Trabajo | Herramientas |
|---|---|---|
| Tokio | Desglosa el texto: tesis, estructura, extensión | `readManuscript` |
| Denver | Detecta lugares comunes y frases hechas | `readManuscript` |
| Berlín | Aplica la hoja de estilo y fija condiciones de aceptación | `readStyleSheet` |
| Río | Marca dónde el texto pierde tensión o se repite | `readManuscript` |
| Lisboa | Comprueba datos, nombres, fechas y citas; devuelve si algo no cuadra | `readManuscript`, `webSearch` |
| Estocolmo | Mide extensión contra el espacio de la sección | `readManuscript`, `getSectionLimits` |
| Nairobi | Resume las objeciones en un informe de una página | ninguna |
| Palermo | Veta la publicación si alguna condición de Berlín no se cumple | ninguna |
| Helsinki | Registra versiones y decisiones | `writeLedger` |
| Profesor | Emite el veredicto: publicable / con cambios / rechazado | `readAll` |

Grafo de traspasos: Tokio → Denver → Berlín → Río → Lisboa → Estocolmo → Nairobi → Palermo → Helsinki → Profesor, con devoluciones permitidas desde Lisboa a cualquiera de los anteriores.

## 7. Panel

- Cabecera: dominio activo, sesión, reloj.
- Log en vivo (`events`), una línea por acción, con codename coloreado.
- Grafo de traspasos (quién pasa a quién, aceptados / devueltos / vetados).
- Métricas del dominio (sección 5 o 6).
- Fila de diez avatares con estado (inactivo / trabajando / esperando).

Estética: monoespaciada para datos, tarjetas, fondo claro. Sin adornos que no muestren datos (nada de penteractos).

## 8. Fases

1. **Motor y log.** Tablas, orquestador, `runAgent`, panel con solo el log. Prueba con dos agentes y un dominio de juguete.
2. **Trading simulado.** Los diez roles, datos reales, cartera ficticia, cron horario. Dejarlo correr una semana.
3. **Olvidos.** Segunda configuración de dominio. Probar con tres textos ya publicados y comparar el informe con lo que se decidió en su momento.
4. **Panel completo.** Grafo, métricas, avatares.

## 9. Prompt inicial para Claude Code

```
Lee este brief completo antes de escribir nada.
Estamos en el monorepo de Por 2 Duros. Crea la app `la-banda` con Next.js 15,
Drizzle sobre Neon y Auth.js con Magic Link, siguiendo las convenciones de
las apps existentes.
Empieza por la fase 1: esquema de la sección 3, orquestador de la sección 4
y una página /panel que muestre el log en vivo.
No implementes ningún dominio todavía. Crea `/domains/toy/config.ts` con dos
agentes (uno que propone, otro que veta) para probar el motor.
Antes de cada decisión de arquitectura que no esté en el brief, pregúntame.
```
