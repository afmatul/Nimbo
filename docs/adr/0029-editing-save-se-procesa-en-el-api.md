# ADR-0029 — El trabajo `editing-save` se procesa en el `api` (excepción acotada a ADR-0001)

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-10-16, Adrián) |
| Fecha | 2026-10-16 |
| Decisores | Adrián (decisión del 2026-10-16), architect, equipo Nimbo |
| Specs relacionadas | 016 (plan §1 y §4); ADR-0001, ADR-0004, ADR-0030; DF-05, DF-20, DF-71; PD-106, PD-110 |

## Contexto

`architecture.md` §7.2 paso 5 y §8 ponían el procesador «Actualizado de Versiones» (`editing-save`) en el `worker`, con
candado en Redis (`IIdempotencyStore`), como el resto del trabajo pesado (ADR-0001). Desde la 015 el canal en vivo es un único
Socket.IO dentro del `api`, con salas **en memoria** y sin adaptador de Redis (ADR-0030, PD-106). El fallo de un guardado debe
avisar a cada participante en cualquier pantalla (`editing.save-failed`, 016 CA-14) mediante `IRealtimePublisher.toUser`, y un
aviso emitido desde el `worker` no llegaría a ningún navegador. Restricciones: equipo de 4, 10 semanas, un servidor de 8 GB con
ONLYOFFICE en ~4 GB (`api` con 768 MB), un solo `api` hoy. El guardado no puede perderse (Art. XI) ni bloquear la petición del
`callback` (DF-20, Art. IX.2).

## Opciones consideradas

1. **Cola `editing-save` (BullMQ/Redis) consumida por un procesador dentro del `api`, concurrencia 1.**
   - Pros: el aviso de fallo sale por las salas que viven en ese proceso, sin infraestructura nueva; conserva durabilidad y
     reintentos de la cola; el `callback` sigue respondiendo de inmediato; idempotencia en BD (`UNIQUE sesion_edicion_id` más
     CAS `activa → guardando`).
   - Contras: el trabajo (descarga de hasta `2 × EDITING_MAX_DOC_BYTES`, validación, subida) comparte memoria y *event loop* con
     el HTTP, lo que ADR-0001 quería evitar; con varias réplicas el aviso puede salir de una réplica sin salas (PD-110).
2. **Procesador en el `worker` y adaptador de Redis para Socket.IO (reabre ADR-0030 opción 2).**
   - Pros: respeta ADR-0001 sin excepciones; sirve también a 019/020/022.
   - Contras: dependencia nueva (`@socket.io/redis-adapter`), dos clientes Redis más y pruebas multiproceso por un único productor;
     YAGNI (Art. V) mientras haya un `api`.
3. **Procesador en el `worker` y aviso de fallo diferido: el `worker` solo marca la sesión `fallida` y el `api` avisa al reabrir.**
   - Pros: ADR-0001 intacto, sin dependencias nuevas.
   - Contras: incumple 016 CA-14 (aviso en vivo en cualquier pantalla); habría que sondear el estado desde el `api`, que es más
     código que la excepción.
4. **Posponer.** Contras: el procesador de la 016 se escribiría dos veces.

## Decisión

Opción 1, como **excepción acotada y reversible** a ADR-0001: solo `editing-save` se procesa en el `api`; los demás
procesadores y trabajos programados siguen en el `worker`. Se limita el riesgo con tres reglas: (a) concurrencia 1 y tope de
descarga `2 × EDITING_MAX_DOC_BYTES` (50 MB inicial), (b) la idempotencia vive en la base de datos y se descarta `IIdempotencyStore`
(DF-72, DF-05), (c) `WorkerModule` no importa `EditingModule`, para que el procesador no corra en dos procesos. Cola con 3
intentos y espera exponencial (sustituye los 5 de `architecture.md` §8); al agotarlos la sesión queda `fallida` con
`editing.save-failed` por `toUser`. Se actualizan `architecture.md` §7.2 (pasos 5 y 6), §8 y §5 en el mismo cambio. Es
defendible porque el aviso de fallo es un requisito de producto y el `api` es el único dueño de las salas hasta que PD-106 se
reabra.

## Consecuencias

- Positivas: CA-14 se cumple sin dependencias nuevas; el cambio se revierte moviendo el procesador al `worker` cuando exista el
  adaptador de Redis (los puertos no cambian).
- Negativas / deuda aceptada: el guardado compite por memoria con el HTTP (riesgo acotado por concurrencia 1 y el tope de tamaño);
  con más de una réplica del `api` el aviso podría no llegar (PD-110, con PD-106); `apps/worker` ya no compone todo el
  «Actualizado de Versiones» del diagrama de arquitectura (DF-71 pide redibujar esa caja).
- Cómo sabremos si fue un error: si la prueba de carga (023) muestra latencia HTTP degradada durante guardados concurrentes, si el
  `api` sufre OOM por el procesador, o si 019/020/022 reabren PD-106; entonces se aplica la opción 2 y el procesador vuelve al
  `worker` (ADR-0001 sin excepción).
