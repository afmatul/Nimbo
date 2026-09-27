# Registro de decisiones de arquitectura (ADR)

Cada decisión estructural se documenta con `docs/sdd/templates/adr-template.md` como `NNNN-slug.md`.
Los ADR no se borran: se reemplazan por otro que los marque como `Reemplazado por`.
Son la base para defender la arquitectura en la exposición final (enunciado §6).

| ADR | Título | Estado |
|---|---|---|
| 0001 | [Monolito modular con worker separado](0001-monolito-modular-con-worker-separado.md) | Aceptado |
| 0002 | [NestJS + TypeORM con migraciones manuales](0002-nestjs-typeorm-migraciones-manuales.md) | Aceptado |
| 0003 | PostgreSQL + pgvector; dimensión de embeddings fija | Pendiente |
| 0004 | ONLYOFFICE Docs solo para `.docx` | Pendiente |
| 0005 | [Autorización en la consulta + RLS como segunda barrera](0005-autorizacion-en-la-consulta-y-rls.md) | Aceptado |
| 0006 | Pagos simulados detrás de `PaymentGateway` | Pendiente |
| 0007 | Modelo de lenguaje detrás de puertos propios | Pendiente |
| 0008 | [Verificación automática de fronteras entre módulos](0008-verificacion-automatica-de-fronteras.md) (`eslint-plugin-boundaries` + `import-x`) | Aceptado |
| 0009 | [Crystal Clear + SDD como proceso](0009-crystal-clear-y-sdd-como-proceso.md) | Aceptado |
| 0010 | [Separar M3 en `access`/`sharing` y extraer `audit`, `realtime`, `notifications`](0010-separacion-de-modulos.md) (DF-02, 03, 30, 34) | Aceptado |
| 0011 | Modelo de nodos: dos tablas con `CHECK` o tabla única (DF-40) | Pendiente |
| 0012 | Versiones por composición con `origen` (DF-17, 18) | Pendiente |
| 0013 | Política del original en el optimizador (DF-21) | Pendiente |
| 0014 | [Tokens de Cielo Sereno ajustados a AA y mapeados a shadcn; axe en E2E](0014-tokens-cielo-sereno-shadcn-axe.md) (DF-41–48) | Aceptado |
| 0015 | [Dependencias de fundaciones: gitleaks, zod, nestjs-pino, Testcontainers](0015-dependencias-de-fundaciones.md) (menor) | Aceptado |

Estados: `Pendiente` (sin redactar) · `Propuesto` (redactado, falta acuerdo del equipo) · `Aceptado` · `Reemplazado por`.
Los ADR 0001, 0002, 0008, 0009, 0014 y 0015 se aceptaron el 26/09/2026 (Adrián, parte de ADR de la T-27 de la spec 000).
Los ADR 0005 y 0010 se aceptaron el 26/09/2026 (Adrián). Desbloquean el PR de CI de la spec 000 (spec §13) y los planes de las specs 001 y 003.

Usa `/adr <decisión>` para redactar uno.
