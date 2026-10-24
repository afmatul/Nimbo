# Registro de decisiones de arquitectura (ADR)

Cada decisión estructural se documenta con `docs/sdd/templates/adr-template.md` como `NNNN-slug.md`.
Los ADR no se borran: se reemplazan por otro que los marque como `Reemplazado por`.
Son la base para defender la arquitectura en la exposición final (enunciado §6).

| ADR | Título | Estado |
|---|---|---|
| 0001 | [Monolito modular con worker separado](0001-monolito-modular-con-worker-separado.md) | Aceptado |
| 0002 | [NestJS + TypeORM con migraciones manuales](0002-nestjs-typeorm-migraciones-manuales.md) | Aceptado |
| 0003 | PostgreSQL + pgvector; dimensión de embeddings fija | Pendiente |
| 0004 | [ONLYOFFICE Docs como editor, solo para `.docx`](0004-onlyoffice-docs-solo-para-docx.md) (spec 016) | Aceptado |
| 0005 | [Autorización en la consulta + RLS como segunda barrera](0005-autorizacion-en-la-consulta-y-rls.md) | Aceptado |
| 0006 | Pagos simulados detrás de `PaymentGateway` | Pendiente |
| 0007 | Modelo de lenguaje detrás de puertos propios | Pendiente |
| 0008 | [Verificación automática de fronteras entre módulos](0008-verificacion-automatica-de-fronteras.md) (`eslint-plugin-boundaries` + `import-x`) | Aceptado |
| 0009 | [Crystal Clear + SDD como proceso](0009-crystal-clear-y-sdd-como-proceso.md) | Reemplazado por 0023 |
| 0010 | [Separar M3 en `access`/`sharing` y extraer `audit`, `realtime`, `notifications`](0010-separacion-de-modulos.md) (DF-02, 03, 30, 34) | Aceptado |
| 0011 | [Modelo de nodos: tablas separadas `archivo` y `carpeta` con `CHECK` de exclusividad](0011-modelo-de-nodos-dos-tablas-con-check.md) (DF-40) | Propuesto |
| 0012 | [Versiones por composición con `origen`; `storage` dueño del ciclo de vida](0012-versiones-por-composicion-con-origen.md) (DF-17, 18) | Aceptado |
| 0013 | Política del original en el optimizador (DF-21) | Pendiente |
| 0014 | [Tokens de Cielo Sereno ajustados a AA y mapeados a shadcn; axe en E2E](0014-tokens-cielo-sereno-shadcn-axe.md) (DF-41–48) | Aceptado |
| 0015 | [Dependencias de fundaciones: gitleaks, zod, nestjs-pino, Testcontainers](0015-dependencias-de-fundaciones.md) (menor) | Aceptado |
| 0016 | [Representación de dinero en centavos y almacenamiento en bytes](0016-dinero-en-centavos-y-almacenamiento-en-bytes.md) (DF-23, DF-24) | Aceptado |
| 0017 | [Dependencias de autenticación: `argon2`, `@nestjs/throttler` y `@nestjs/jwt` con Passport](0017-dependencias-de-autenticacion.md) (menor; cierra PD-32) | Aceptado |
| 0018 | [Correo transaccional con nodemailer por SMTP y la cola `mail`](0018-correo-con-nodemailer-y-cola-mail.md) (menor) | Aceptado |
| 0019 | [Eventos de dominio en proceso con `@nestjs/event-emitter`; el contrato lo exporta el productor](0019-eventos-de-dominio-en-proceso.md) (arista `billing → identity`) | Aceptado |
| 0020 | [Validación HTTP con zod desde `packages/contracts`](0020-validacion-http-con-zod-desde-contracts.md) (enmienda ADR-0015 b) | Aceptado |
| 0021 | [Mantenimiento sin actor bajo RLS: función `SECURITY DEFINER` mínima y RLS también en `carga`](0021-mantenimiento-sin-actor-bajo-rls-y-rls-en-carga.md) (enmienda ADR-0005; DF-52, PD-19) | Aceptado |
| 0022 | [`storage` declara `IPlanLimitsProvider`](0022-storage-declara-iplanlimitsprovider.md) (DF-51, opción A) | Aceptado |
| 0023 | [SDD express desde la Fase 2: plan obligatorio, artefactos cortos y un PR por spec](0023-sdd-express-desde-la-fase-2.md) (reemplaza 0009; cambia constitución Art. I.2) | Aceptado |
| 0024 | [Avisos no bloqueantes con `sonner` (toast de shadcn/ui); errores siguen como `Alert`](0024-avisos-no-bloqueantes-con-sonner.md) (menor; spec 006) | Aceptado |
| 0025 | [Imágenes de MinIO desde el fork de Pigsty (`pgsty/silo` y `pgsty/mc`)](0025-imagenes-de-minio-desde-el-fork-de-pigsty.md) (enmienda ADR-0015; Quay dejó de servir los tags) | Propuesto |
| 0028 | [Dependencia de `billing` para la factura PDF: `pdfkit` detrás de `IInvoiceGenerator`](0028-dependencia-de-billing-para-la-factura-pdf.md) (menor; spec 009 T-07) | Aceptado |
| 0029 | [El trabajo `editing-save` se procesa en el `api`](0029-editing-save-se-procesa-en-el-api.md) (excepción acotada a ADR-0001; spec 016, DF-71) | Aceptado |
| 0030 | [Socket.IO en el `api` con los paquetes oficiales de Nest y sin adaptador de Redis](0030-socketio-en-el-api-sin-adaptador-de-redis.md) (spec 015) | Aceptado |
| 0031 | [La referencia del instrumento de pago se guarda en claro bajo RLS, no como hash](0031-referencia-del-instrumento-de-pago-en-claro-bajo-rls.md) (delimita Art. IX.6; spec 010, M-2) | Aceptado |
| 0032 | [La solo lectura por vencimiento se comprueba en los servicios de escritura con `PlanLimits.readOnly`](0032-solo-lectura-por-planlimits-en-los-servicios-de-escritura.md) (enmienda `architecture.md` §7.5 y la nota de DF-51; spec 010; antes numerado 0029) | Aceptado |
| 0033 | [SDD express en un pase: spec, plan y tareas juntos](0033-sdd-express-un-pase.md) (enmienda la secuencia de ADR-0023) | Propuesto |

Estados: `Pendiente` (sin redactar) · `Propuesto` (redactado, falta acuerdo del equipo) · `Aceptado` · `Reemplazado por`.
Los ADR 0001, 0002, 0008, 0009, 0014 y 0015 se aceptaron el 26/09/2026 (Adrián, parte de ADR de la T-27 de la spec 000).
Los ADR 0005 y 0010 se aceptaron el 26/09/2026 (Adrián). Desbloquean el PR de CI de la spec 000 (spec §13) y los planes de las specs 001 y 003.
Los ADR 0017 a 0020 los redactó el `architect` con el plan de la spec 001 y los aceptó Adrián el 27/09/2026
(ADR-0017 con Passport, opción c.2). ADR-0020 enmienda la parte b de ADR-0015.

Los ADR 0011, 0012 y 0021 los redactó el `architect` con el plan de la spec 005 (2026-09-28) como `Propuesto`; 0011 y 0012 siguen el E-R vigente y 0021 enmienda ADR-0005.
ADR-0012 se aceptó el 10/10/2026 (Adrián) con la spec 014, que lo implementa.
La dependencia `@aws-sdk/s3-request-presigner` (plan 005) se registró como adenda de ADR-0015, sin ADR aparte.
ADR-0016 se aceptó el 29/09/2026: cierra DF-23 y DF-24. `Money` y `transaccion.monto` se implementan en la 009.
ADR-0022 se aceptó el 29/09/2026: opción A de DF-51. El 0021 sigue siendo el de mantenimiento sin actor.
ADR-0021 lo aceptó Adrián el 14/10/2026 en la revisión de la 009, que suma tres funciones de lectura con la misma lista.
El 0023 lo redactó y lo aceptó Adrián el 30/09/2026 al adoptar SDD express; reemplaza al 0009 y cambia el Art. I.2 de la constitución.
El 0024 lo redactó el `architect` y lo aprobó Adrián el 30/09/2026 (dependencia `sonner`, spec 006).
Los ADR 0004 y 0029 los redactó el `architect` con el plan de la spec 016 (2026-10-16) como `Propuesto`; Adrián los aceptó al aprobar el plan (2026-10-16); 0029 hace una excepción acotada a ADR-0001 y matiza ADR-0030.
ADR-0033 (2026-10-23) enmienda la secuencia de ADR-0023: un solo pase al crear una spec que todavía no tiene carpeta. No reescribe las que ya existen.

Usa `/adr <decisión>` para redactar uno.
