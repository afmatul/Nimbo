# Revisión — 001 PR-2 «notifications y worker» (T-20 a T-27)

| Campo | Valor |
|---|---|
| Rama | `feat/001-correo-y-worker` |
| Base del diff | `feat/001-contratos-migraciones-shared` (`c2c5514`) |
| Revisor | `reviewer` (2026-09-28) |
| Veredicto | ⚠️ No aprobado todavía: sin bloqueantes de diseño ni de seguridad; bloqueante de proceso por pruebas de integración sin ejecutar |

## Bloqueantes

1. **[B-1] Pruebas de integración sin ejecutar** (`tasks.md`, T-27 y «Notas del developer»). No corrieron
   `smtp-mailer`, `smtp-transport`, `mailer-contract`, `mail-degradation`, el caso `worker.started` de
   `bootstrap.int-spec.ts` ni `worker-health.int-spec.ts`, ni `pnpm dev` con el worker consumiendo `mail`, por falta de
   Docker. Son las que demuestran CA-18 y CA-21 de punta a punta. No fusionar hasta tenerlas en verde.

## Importantes

1. **[I-1] Ventana ajustada en `mail-degradation.int-spec.ts:113-132`.** Con retroceso de 0,5 s los 6 intentos se
   agotan en ~15,5 s, y el Mailpit tardío se levanta dentro de esa ventana; si el contenedor tarda, la prueba falla o
   parpadea. Ampliar el retroceso de la prueba (1–2 s) o levantar `lateMailpit` antes del segundo intento.
2. **[I-2] Ventana de duplicado no atómica** (`mail.processor.ts:75-79`: `exists` → `deliver` → `set NX`). Riesgo ya
   aceptado por ADR-0018; queda trazado aquí.
3. **[I-3] Justificación imprecisa de los tiempos de espera de `SmtpTransport`** (nota de T-22). BullMQ renueva el
   bloqueo mientras el proceso vive, así que no hay un «bloqueo de 30 s» que expire. Reescribir la nota como «evita
   que un SMTP colgado bloquee indefinidamente el intento actual».

## Sugerencias

1. `worker-health.int-spec.ts:77-95`: los casos que detienen Mailpit y Redis dependen del orden dentro del `describe`
   (patrón previo); aislarlos si se vuelve a tocar el archivo.
2. `smtp-mailer.ts:29`: falta una prueba de que `MailMessage` no se muta tras `send`.

## Lo que está bien

- Idempotencia en tres capas según ADR-0018: `jobId = idempotencyKey`, marca `mail:sent:<jobId>` con
  `SET NX EX 604800`, `Message-ID` fijo; formato `<tag>.<id>` validado por `assertIdempotencyKey` con pruebas.
- Reintentos y retención según R-9 (`attempts: 6`, retroceso exponencial de 5 s, retención de fallidos 24 h), con
  opciones inyectables para las pruebas.
- Bitácoras sin destinatario, asunto, cuerpo ni enlaces, verificado por pruebas; `REDACTED_FIELDS` como defensa.
- Fronteras: puerto en `application/ports`, adaptadores en `infrastructure`, `index.ts` con lista cerrada probada;
  el `api` no recibe credenciales SMTP.
- La salud del worker no depende del SMTP (Art. XII).
- Dependencias fijadas (`nodemailer` 10.0.11, `@types/nodemailer` 8.0.2, Mailpit v1.31.3) y documentación coherente.
