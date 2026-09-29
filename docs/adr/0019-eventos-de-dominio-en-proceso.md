# ADR-0019 — Eventos de dominio en proceso con `@nestjs/event-emitter`; el contrato lo exporta el productor

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-09-27, Adrián) |
| Fecha | 2026-09-27 |
| Decisores | Adrián (architect), equipo Nimbo |
| Specs relacionadas | 001 (D-4, CA-8, CA-29 d), 006a (consumidor), ADR-0010 («el mecanismo de eventos se decide con su propio ADR cuando una spec lo requiera»), `architecture.md` §3 reglas 1, 2 y 4 |

## Contexto

La 001 es la primera spec con un evento entre módulos. Al verificar el correo, `identity` publica que una cuenta de
cliente quedó verificada. `billing` (006a) lo consume y crea la suscripción Personal (D-4). La spec fija cuatro cosas:

- el evento lleva solo el `id` de la cuenta;
- se publica **una vez** por cuenta (CA-8);
- `identity` no depende de `billing`: no conoce planes ni suscripciones (D-2 quitó `subscriptionId`);
- la verificación funciona aunque 006a todavía no exista.

`architecture.md` §3 ya anuncia otros eventos (`FileUploaded`, `FileVersionCreated`, `FileTrashed`,
`SubscriptionExpired`, `EditSessionClosed`). Hay que decidir dos cosas:

1. **El mecanismo**: cómo viaja el evento y qué garantías da.
2. **Dónde vive su contrato** (nombre y forma), y qué arista del grafo crea.

El plan de la 001 propone que lo exporte `identity/index.ts`, lo que agrega `billing → identity`. Restricciones:
monolito modular con un `api` y un `worker` (ADR-0001), DAG verificado por lint (ADR-0008), 3 días para el Avance 1.

## Opciones consideradas

### a) Mecanismo

1. **`@nestjs/event-emitter` en proceso, publicado después del commit**
   - Pros:
     - paquete oficial de Nest, pequeño (`eventemitter2`);
     - los oyentes se declaran con `@OnEvent` y el productor no conoce a sus consumidores;
     - la emisión es síncrona en el mismo contexto asíncrono, así que el `correlationId` de `AsyncLocalStorage` llega
       al oyente sin hacer nada;
     - no suma infraestructura.
   - Contras:
     - si el proceso cae entre el commit y la emisión, o el oyente falla, el evento se pierde (sin reintentos);
     - solo llega a los oyentes del mismo proceso.
2. **Una cola BullMQ por evento**
   - Pros: reintentos del consumidor y supervivencia a reinicios del consumidor.
   - Contras:
     - la misma ventana de pérdida entre el commit y el encolado, porque Redis no participa de la transacción de
       Postgres;
     - una cola, un procesador y opciones de reintento por evento;
     - el consumidor corre en el `worker` aunque su trabajo sea una sola fila.
3. ***Outbox* transaccional**: tabla `evento_dominio` escrita en la misma transacción y un despachador periódico.
   - Pros: entrega al menos una vez, sin ventana de pérdida.
   - Contras: una tabla, su migración, un trabajo que la recorre, su limpieza y la deduplicación en el consumidor.
     Es el mecanismo más caro, para un solo evento cuya pérdida se repara con una conciliación idempotente.
4. **Llamada síncrona por puerto**: `identity` declara `IClientAccountVerifiedHandler` y `billing` lo implementa.
   - Pros: sin librería.
   - Contras:
     - crea la misma arista `billing → identity`;
     - acopla la respuesta de la verificación a `billing`: si crear la suscripción falla, la verificación también,
       o hay que atrapar el error, y entonces es un evento mal escrito;
     - un segundo consumidor obliga a cambiar el puerto.
5. **Posponer**: la 001 debe publicar el evento (CA-8), aunque 006a aún no lo consuma.

### b) Dónde vive el contrato del evento

1. **En el productor, exportado por `modules/identity/index.ts`**
   - Qué implica: el consumidor importa el nombre y la forma del evento, y aparece la arista `billing → identity`.
   - Pros:
     - `architecture.md` §3, regla 4, ya permite exportar eventos por `index.ts`;
     - la dirección coincide con la del dominio: la suscripción depende de la cuenta (`suscripcion.usuario_id`
       apunta a `usuario`), nunca al revés;
     - el lint ve la arista (ADR-0008);
     - el compilador verifica que productor y consumidor usan la misma forma.
   - Contras: `billing` depende de `identity` y queda un módulo más en su lista.
2. **En `shared`**
   - Contras:
     - `shared` no tiene reglas de negocio (DF-49) y su README solo admite lo que usan ≥ 3 módulos; «cuenta de
       cliente verificada» es un concepto de `identity` con un solo consumidor;
     - `shared` terminaría como catálogo de todos los eventos del sistema, y todo módulo dependería de conceptos de
       todos.
3. **En `packages/contracts`**
   - Contras:
     - `contracts` es la fuente única de contratos HTTP entre `web` y `api` (Art. VI), y un evento interno no es un
       contrato HTTP;
     - cualquier módulo puede importar `@nimbo/contracts`, así que el acoplamiento `billing`–`identity` existiría
       sin que el lint de fronteras lo viera: una arista oculta es peor que una declarada.
4. **Solo el nombre como texto**: cada consumidor redeclara la forma.
   - Contras: el mismo conocimiento en dos lugares (Art. VI) y, si el productor cambia la forma, el consumidor se
     rompe en tiempo de ejecución, no al compilar.

## Decisión

**a) Opción 1**: `@nestjs/event-emitter` en proceso, con estas reglas:

- **Publicación**:
  - se publica **después del commit**, nunca dentro de la transacción: así un evento no anuncia datos que se
    revirtieron;
  - el productor publica a través de un puerto propio (`IAccountEventsPublisher` en `identity`, regla (a) de
    Art. V.2: aísla la librería);
  - si el oyente lanza una excepción de forma síncrona, la implementación la atrapa y la registra: un oyente nunca
    convierte en error una operación ya confirmada.
  - Cuando un tercer módulo publique eventos, el puerto se extrae a `shared` como `IDomainEventPublisher` (regla de
    tres, Art. VI.2).
- **Consumo**:
  - los oyentes viven en el módulo consumidor como adaptadores de entrada (`presentation/*.listener.ts`, igual que un
    controlador), declarados con `@OnEvent(NOMBRE, { async: true })`, y delegan en un servicio de aplicación;
  - todo oyente es **idempotente** (Art. XI.2);
  - todo consumidor cuya pérdida de un evento deje datos inconsistentes tiene una **conciliación** idempotente.
    Para 006a: «toda cuenta `CLIENT` verificada sin suscripción recibe Personal», en su migración de datos o en un
    trabajo.
- **Procesos**: un evento solo llega a los oyentes del proceso que lo emite. Si el consumidor debe correr en el
  `worker`, el oyente encola un trabajo BullMQ.
- **Nombres**: `<modulo>.<hecho-en-pasado>` (`identity.client-account-verified`).
- **Versión**: `@nestjs/event-emitter` queda fijado en `3.1.0`; la serie 12 es solo ESM y `api` compila a CommonJS.
  Subir de serie exige migrar `api` a ESM (spec 001, revisión del PR-3).

**b) Opción 1**: el contrato lo exporta el productor en su `index.ts`, como una constante con el nombre
(`CLIENT_ACCOUNT_VERIFIED`) más el tipo de solo lectura del contenido (`ClientAccountVerifiedEvent { userId }`).

- Se **acepta la arista `billing → identity`**, restringida a importar contratos de eventos desde
  `identity/index.ts`. El revisor lo comprueba en cada PR de `billing`.
- El DAG se mantiene: `identity` depende de `shared`, `notifications` y `audit`, y ninguno de ellos depende de
  `billing`. `backoffice` ya dependía de ambos.
- `boundaries.js` agrega `identity` a `allowed.billing` y un *fixture* negativo `identity-imports-billing.ts`.
- La misma regla vale para los eventos futuros: el consumidor depende del productor. Si eso crea un ciclo, el evento
  no es la herramienta y se vuelve a `architecture.md` §3, regla 1.

## Consecuencias

- Positivas:
  - `identity` no conoce `billing`, y la verificación de la 001 funciona sin 006a;
  - un mecanismo que se explica en una frase, sin tablas ni colas nuevas;
  - la arista es visible y el lint la verifica.
- Negativas / deuda aceptada:
  - Entrega «como máximo una vez»: la consistencia final depende de que cada consumidor tenga su conciliación. Es
    una obligación más en el plan de 006a (P-6 del plan 001).
  - Los oyentes comparten proceso con el productor: uno lento o que consuma mucha memoria afecta al `api`, así que
    el trabajo pesado va a una cola.
  - `billing` suma una dependencia a su lista.
- Cómo sabremos si fue un error:
  - si un evento necesita entrega garantizada sin posibilidad de conciliación (facturación, `SubscriptionExpired`
    con efectos de cobro) → *outbox* con su propio ADR;
  - si `identity` necesita algo de `billing` → el evento no alcanza y hay que revisar la frontera;
  - si aparecen eventos perdidos en staging sin que la conciliación los repare.
