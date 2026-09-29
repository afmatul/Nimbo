# ADR-0018 — Correo transaccional con nodemailer por SMTP y la cola `mail` (ADR menor)

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-09-27, Adrián) |
| Fecha | 2026-09-27 |
| Decisores | Adrián (architect), equipo Nimbo |
| Specs relacionadas | 001 (R-4, R-5, R-9, D-11, D-12, CA-18, CA-20, CA-21), 002 (recuperación y avisos por correo), ADR-0010 (`notifications` declara e implementa `IMailer`) |

## Contexto

La 001 envía el enlace de verificación y el aviso de intento de registro. La 002 enviará la recuperación de contraseña
y el aviso de dispositivo nuevo. Lo que ya está fijado:

- `identity` usa el puerto `IMailer`, que declara e implementa `notifications` (ADR-0010, 001 R-4);
- en local el correo va a Mailpit (R-5); en staging, al SMTP de Resend **por protocolo, no por su SDK** (D-12);
- la cola `mail` reintenta 5 veces y es idempotente (R-9, `architecture.md` §8);
- una caída del servidor de correo no rompe el registro (CA-21, Art. XII);
- las bitácoras nunca llevan el correo ni el token (D-18, CA-18).

`architecture.md` §8 decía «idempotente por `notificacion.id`», pero la 001 no crea la tabla `notificacion` (su §12:
solo correo). Hace falta decidir la librería, dónde ocurre el envío y cuál es la clave de idempotencia.

## Opciones consideradas

1. **nodemailer por SMTP, encolado en `mail` y enviado por el `worker`** (esta propuesta)
   - Pros:
     - SMTP es estándar: el mismo adaptador habla con Mailpit, con Resend y con cualquier otro proveedor, y la prueba
       de contrato de `IMailer` corre contra Mailpit real (Art. III.2);
     - el `api` solo encola, así que responde igual con el SMTP caído (CA-21) y **no** necesita las credenciales
       SMTP: solo el `worker` las recibe;
     - los reintentos y el retroceso los da BullMQ, que ya está en la pila (000).
   - Contras:
     - el trabajo guarda en Redis el destinatario y el cuerpo (que incluye el enlace) mientras se entrega;
     - un proceso más interviene en cada envío.
2. **SDK HTTP de Resend**
   - Pros: estado de entrega por API.
   - Contras: D-12 lo descarta; ata el código al proveedor; Mailpit no habla ese API, así que harían falta dos
     adaptadores y la prueba de contrato no probaría el de staging.
3. **nodemailer desde el `api`, sin cola**
   - Pros: más simple, sin trabajo en Redis.
   - Contras: el registro esperaría al SMTP (latencia de red en cada alta), un SMTP caído lo convierte en error o en
     reintentos dentro de la petición (rompe CA-21), y el `api` tendría las credenciales.
4. **Tabla `notificacion` como bandeja de salida** (idempotencia por `notificacion.id`, como decía §8)
   - Pros: registro duradero de cada envío.
   - Contras: la 001 excluye la tabla (§12) y ninguna spec activa pide un historial de correos. Es una tabla más, su
     migración y su limpieza (Art. V).
5. **Posponer**: la 001 no se puede demostrar sin el correo de verificación.

## Decisión

Opción 1.

- **Puerto y reparto**:
  - `IMailer.send(message: MailMessage): Promise<void>`, con `MailMessage = { to, subject, text, html, idempotencyKey,
    tag, recipientId? }`. `notifications` no conoce reglas de `identity`: recibe qué enviar y a quién.
  - En el `api`, `SmtpMailer` (nombre del diagrama) encola en `mail`.
  - En el `worker`, `MailProcessor` («processor») entrega con `SmtpTransport`, un envoltorio de nodemailer.
- **Reintentos**:
  - `attempts: 6`, el envío más 5 reintentos (R-9), con `backoff` exponencial desde 5 s;
  - `removeOnComplete: true` y `removeOnFail: { age: 86400 }`: 24 h, lo mismo que dura un enlace.
- **Idempotencia**, por la clave que decide el productor, sin tabla:
  1. `jobId = idempotencyKey`. BullMQ **rechaza `:` en un `jobId`** (`Custom Id cannot contain :`), así que las
     claves usan `.` o `-` como separador (p. ej. `identity.verification.<id del token>`);
  2. antes de enviar, el procesador revisa la marca `mail:sent:<jobId>` en Redis. Después de un envío aceptado la
     escribe con `SET NX EX 604800`, para que un trabajo reintentado o estancado tras un éxito no reenvíe;
  3. `Message-ID: <jobId@nimbo.me>`, para los servidores que deduplican por ese campo.
- **Destinos**:
  - local: Mailpit, `SMTP_TLS=none`;
  - staging: `smtp.resend.com:465` con TLS implícito, usuario `resend` y la clave de API como contraseña, con SPF y
    DKIM de `nimbo.me` (D-12).
  - `SMTP_TLS=none` está prohibido fuera de local.
  - Las variables `SMTP_*` y `MAIL_FROM` son del esquema de entorno del `worker`. `SMTP_PASSWORD` es secreta y se
    redacta.
- **Bitácoras**: `mail.enqueued`, `mail.sent`, `mail.retry_scheduled`, `mail.failed` y `mail.duplicate_skipped`,
  con `correlationId` (el de la petición que encoló), `tag`, `recipientId` y el código del error de nodemailer.
  **Nunca** con `err.message`, porque nodemailer incluye ahí la dirección, ni con los campos del mensaje.
- **La tabla `notificacion`** la crea la primera spec que necesite notificaciones dentro de la aplicación, con su
  propio plan. `architecture.md` §8 pasa a «por `idempotencyKey` del productor (`jobId`) + marca en Redis».

## Consecuencias

- Positivas:
  - el registro no depende del SMTP;
  - el adaptador de staging es el mismo que se prueba en local;
  - el `api` no tiene credenciales de correo;
  - la idempotencia no necesita tabla.
- Negativas / deuda aceptada:
  - Mientras se entrega, y hasta 24 h si falla, el trabajo guarda en Redis el correo y el enlace en claro.
    Mitigación: Redis sin puertos publicados fuera de la red de compose, `removeOnComplete` y `removeOnFail` a 24 h.
    Es un riesgo aceptado, documentado en el plan 001 §7b.
  - La marca en Redis no cubre una caída entre el envío aceptado y la escritura de la marca: en ese caso puede
    llegar un duplicado, y `Message-ID` lo atenúa.
  - Sin historial duradero de envíos: el diagnóstico se hace por bitácoras.
- Cómo sabremos si fue un error:
  - si una spec necesita consultar qué correos se enviaron a una cuenta (historial, reenvío manual desde
    backoffice) → bandeja de salida en `notificacion`;
  - si la cuota o la entregabilidad de Resend no alcanzan para la demo → otro SMTP, sin tocar código;
  - si aparecen duplicados en pruebas de CA-21 → revisar el orden marca/envío.
