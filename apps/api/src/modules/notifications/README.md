# `notifications` — T4 · transversal

- **Dueño**: Juan Marcos (`specs/README.md`).
- **Diagrama de origen**: T4 en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: Correo y notificaciones; declara, implementa y exporta `IMailer` e `INotifier` (ADR-0010).
- **Puede depender de**: shared, realtime (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir).
- **Specs que lo construyen**: 001 (correo de verificación y aviso de intento de registro).
- **Decisión**: ADR-0018 (nodemailer por SMTP y la cola `mail`).

## Capas (`docs/sdd/architecture.md` §4)

```
modules/notifications/
├─ application/ports/i-mailer.port.ts   # IMailer, MailMessage, I_MAILER, assertIdempotencyKey
├─ infrastructure/
│  ├─ mail-queue.ts                     # MAIL_QUEUE = 'mail', MAIL_JOB_OPTIONS (+ su token), MailJobData
│  ├─ smtp-mailer.ts                    # api: SmtpMailer implements IMailer (solo encola)
│  ├─ mail.processor.ts                 # worker: MailProcessor (idempotencia + bitácoras)
│  └─ smtp-transport.ts                 # worker: nodemailer desde SMTP_* y MAIL_FROM
├─ notifications.module.ts              # api: cola `mail` + I_MAILER → SmtpMailer
├─ notifications-worker.module.ts       # worker: MailProcessor + SmtpTransport
└─ index.ts                             # única API pública
```

## Puerto `IMailer`

`send(message: MailMessage): Promise<void>` con `MailMessage = { to, subject, text, html, idempotencyKey, tag,
recipientId?, attachment? }`. `notifications` no conoce las reglas de quien envía: recibe qué enviar y a quién. `tag` (p. ej.
`identity.verification`) y `recipientId` (id de la cuenta) sirven solo para las bitácoras. `attachment = { filename,
contentType, contentBase64 }` es un adjunto opcional (hoy, la factura PDF del comprobante de `billing`); va en base64
porque el mensaje viaja como JSON en la cola `mail`, y nunca se registra.

**Formato de `idempotencyKey`**: `<tag>.<id>`, p. ej. `identity.verification.<id del token>` o
`identity.attempt-notice.<uuid>`. Solo letras ASCII, dígitos, `.`, `-` y `_`; **nunca `:`**, porque la clave es el
`jobId` de BullMQ y este lo rechaza. `SmtpMailer` la valida con `assertIdempotencyKey` y lanza sin encolar si no
cumple. La decide el productor: dos `send` con la misma clave entregan un solo correo.

## Reparto entre procesos

- **`api`** (`NotificationsModule`): `SmtpMailer` encola el trabajo `send` en `mail` con el `correlationId` de la
  petición y `jobId = idempotencyKey`. No necesita credenciales SMTP y responde igual con el servidor de correo caído.
- **`worker`** (`NotificationsWorkerModule`): `MailProcessor` entrega con `SmtpTransport`. El proceso no arranca sin
  `SMTP_HOST`, ni con `SMTP_TLS=none` en staging o producción (`config.invalid`). La salud del `worker` sigue
  dependiendo solo de Redis: un SMTP caído degrada el correo, no el proceso (Art. XII).

## Reintentos

`attempts: 6` (el envío y 5 reintentos, R-9) con retroceso exponencial desde 5 s: 5, 10, 20, 40 y 80 s (~2,5 min).
`removeOnComplete: true`; `removeOnFail: { age: 86400 }` (24 h, lo que dura el enlace). Las pruebas de integración
acortan el retroceso sustituyendo `MAIL_JOB_OPTIONS_TOKEN`. `SmtpTransport` usa tiempos de espera por debajo del
bloqueo de 30 s de BullMQ para que un SMTP colgado no deje el trabajo estancado.

## Idempotencia en tres capas

1. `jobId = idempotencyKey`: BullMQ no crea un segundo trabajo con el mismo id mientras el primero exista.
2. Marca `mail:sent:<jobId>` en Redis: el procesador la revisa antes de entregar y la escribe con
   `SET NX EX 604800` tras un envío aceptado; un reintento o un trabajo estancado después de un éxito no reenvía
   (`mail.duplicate_skipped`).
3. `Message-ID: <jobId@nimbo.me>`, para los servidores que deduplican por ese campo.

Riesgo aceptado (ADR-0018): una caída entre el envío aceptado y la escritura de la marca puede duplicar un correo;
el `Message-ID` lo atenúa.

## Bitácoras

| Evento                   | Nivel | Campos                                                                                |
| ------------------------ | ----- | ------------------------------------------------------------------------------------- |
| `mail.enqueued`          | info  | `tag`, `recipientId`, `jobId`                                                         |
| `mail.sent`              | info  | `tag`, `recipientId`, `attemptsMade`                                                  |
| `mail.retry_scheduled`   | warn  | `tag`, `recipientId`, `attemptsMade`, `errorCode`, `responseCode`                     |
| `mail.failed`            | error | `tag`, `recipientId`, `attemptsMade`, `errorCode`, `responseCode` (intentos agotados) |
| `mail.duplicate_skipped` | info  | `tag`, `jobId`                                                                        |

Todas llevan el `correlationId` de la petición que encoló; las del `worker`, también `jobId`. **Regla**: nunca se
registra `job.data`, un `MailMessage` completo ni `err.message` (nodemailer incluye ahí la dirección del
destinatario, D-18). `to`, `html` y `text` están además en `REDACTED_FIELDS` como defensa en profundidad.

## Local

Mailpit recibe el correo: bandeja en <http://localhost:8025>, SMTP en `localhost:1025` (ver
`docs/operations/ambientes.md` §3b).

## Regla

Otros módulos importan **solo** desde `modules/notifications/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.
