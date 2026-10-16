# ADR-0028 — Socket.IO en el `api` con los paquetes oficiales de Nest y sin adaptador de Redis

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-10-15, Adrián) |
| Fecha | 2026-10-15 |
| Decisores | Adrián (architect), equipo Nimbo |
| Specs relacionadas | 015 (plan §2 y §7), 016 (consumidora), ADR-0010 (gateway único), ADR-0019 (evento de salida), PD-74, DF-65 |

## Contexto

La 015 entrega el canal en vivo del producto (RF-26, presencia de coedición en 016). ADR-0010 fijó **un** gateway
Socket.IO en `realtime` con salas por usuario y por documento, pero no la dependencia: el `package.json` aún no trae
`@nestjs/websockets`, `@nestjs/platform-socket.io` ni `socket.io-client`. El stack del proyecto ya nombra Socket.IO.
Restricciones: equipo de 4, entrega de la Fase 2, un solo proceso `api` en un servidor de 8 GB (ONLYOFFICE ocupa ~4 GB),
25 usuarios concurrentes (RNF-02), y hoy ningún productor de avisos vive en el `worker`.

## Opciones consideradas

1. **`@nestjs/websockets` + `@nestjs/platform-socket.io` (`socket.io` 4.x) en `api`, `socket.io-client` 4.x en `web`, sin
   adaptador de Redis** (versiones exactas).
   - Pros: integración oficial con Nest (gateway, `IoAdapter`, `@SubscribeMessage`); salas, reconexión automática con
     retraso exponencial, latido y respaldo por *polling* vienen hechos (CA-9, CA-11, RNF-09); cero infraestructura nueva;
     salas en memoria bastan con un `api`.
   - Contras: las salas son del proceso; un aviso emitido desde otro proceso (el `worker`) o con varias réplicas del `api`
     no llega. Se acepta y se registra como PD-74.
2. **Opción 1 más `@socket.io/redis-adapter`.**
   - Pros: avisos desde el `worker` y réplicas del `api`.
   - Contras: otra dependencia, dos clientes Redis más y pruebas multiproceso para un caso que ninguna spec activa tiene
     (YAGNI, Art. V). Se puede sumar después sin cambiar los puertos (`IRealtimePublisher` oculta el servidor).
3. **`ws` o `@nestjs/platform-ws` con protocolo propio.**
   - Pros: menos código de terceros en el cliente.
   - Contras: habría que construir reconexión, salas, latido, ack y respaldo por *polling*; más código propio que defender y
     probar, sin ventaja para 25 usuarios.
4. **Server-Sent Events por HTTP.**
   - Pros: simple, atraviesa proxies, sin dependencia nueva.
   - Contras: unidireccional (el cliente no puede responder pings, y 016 puede necesitar canal bidireccional); sin salas
     ni latido propio; contradice el stack y ADR-0010.
5. **Posponer.** 016 no puede mostrar presencia sin canal; el riesgo solo se mueve a la semana de edición.

## Decisión

Opción 1. `realtime` monta un único servidor Socket.IO en el `api` con `RealtimeIoAdapter`; el adaptador de Redis queda
fuera hasta que haya más de una réplica o un productor en el `worker` (PD-74). Las dependencias se fijan a versión exacta
(`@nestjs/websockets` y `@nestjs/platform-socket.io` 11.2.5 con `socket.io` 4.x en `api`; `socket.io-client` 4.x en `web`)
y solo las importa `realtime` (más el cliente de `web/src/features/realtime`), de modo que los demás módulos dependen de
`IRealtimePublisher` e `IDocumentRooms`, nunca del paquete. Es defendible porque cubre CA-9 y CA-11 con funciones ya probadas
y no agrega infraestructura.

## Consecuencias

- Positivas: canal listo para 016 con poco código propio; cambiar de servidor o añadir Redis no toca a los productores.
- Negativas / deuda aceptada: sin escala horizontal ni avisos desde el `worker` (PD-74); el estado de salas se pierde al
  reiniciar el `api` (los clientes reconectan y 016 readmite, CA-11); tres dependencias nuevas en el árbol.
- Cómo sabremos si fue un error: si 019/020/022 necesitan emitir desde el `worker`, o si la prueba de carga (023) muestra
  presión de memoria con ONLYOFFICE activo; entonces se reabre con la opción 2.
