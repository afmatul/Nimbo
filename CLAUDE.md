# Nimbo — Contexto raíz para Claude Code

Nimbo es una plataforma de **Almacenamiento como Servicio (PaaS)** construida como Proyecto Final de
Ingeniería de Software I (URL, 2026) por un equipo de 4 personas con Crystal Clear y **Spec-Driven
Development (SDD)**. Se concibe como una startup: se evalúa funcionamiento, UX, calidad de la
arquitectura y la capacidad de defender cada decisión.

Lo que la diferencia de una nube común:
1. **Edición colaborativa de `.docx`** en el navegador (ONLYOFFICE Docs), sin conversión de formato.
2. **Historial de versiones con autoría**: cada sesión de edición genera una versión asociada a sus participantes y restaurable.
3. **Inteligencia documental**: un agente responde preguntas sobre los archivos del usuario citando archivo y ubicación exacta.

## Lee esto antes de actuar

| Necesitas saber…                          | Archivo                                   |
|-------------------------------------------|-------------------------------------------|
| Principios no negociables                 | `docs/sdd/constitution.md`                |
| Qué hace el producto (RF, RNF, roles, planes) | `docs/sdd/product-context.md`         |
| Cómo está construido                      | `docs/sdd/architecture.md`                |
| Clases, puertos, tablas y su mapeo        | `docs/sdd/design-model.md`                |
| Problemas conocidos del diseño (DF-xx)    | `docs/sdd/design-findings.md`             |
| Pendientes transversales (diagramas, docs, decisiones) | `docs/sdd/pendientes.md`     |
| Diagramas originales (PDF, entregables)   | `docs/design/diagramas/`                  |
| Sistema de diseño Cielo Sereno (original) | `docs/design/design-system/design-cielo-sereno.md` |
| Cómo aplicar el diseño en la UI           | `docs/sdd/ui-guidelines.md`               |
| Mockups (código) y capturas               | `docs/design/mockups/`, `docs/design/capturas/` |
| Convenciones de código, git y PR          | `docs/sdd/conventions.md`                 |
| Flujo SDD, estados y compuertas           | `docs/sdd/workflow.md`                    |
| Plantillas (spec, plan, tareas, ADR…)     | `docs/sdd/templates/`                     |
| Backlog de specs y su estado              | `specs/README.md`                         |
| Decisiones de arquitectura                | `docs/adr/`                               |

No cargues todos los archivos siempre: lee el que la tarea necesita.

## Regla de oro

**Sin spec aprobada no hay código.** La spec es la fuente de verdad. Si el código necesita
comportarse distinto a lo que dice la spec, primero se corrige la spec y después el código.

## Flujo de trabajo (SDD lite)

```
/spec  →  /tasks  →  /implement  →  /review  →  PR + aprobación humana  →  merge
```

`/plan` es opcional: solo para specs transversales, con puerto nuevo entre módulos, tecnología nueva o cambio de
arquitectura (lo aprueba `architect`). `/verify` es opcional y queda absorbido en `/review`.
Apoyo: `/status` (avance), `/adr` (decisiones), `/design-check` (coherencia código ↔ diagramas), `/mockup` (mockups y capturas).

| Subagente          | Responsabilidad                                                     | Escribe en                          |
|--------------------|---------------------------------------------------------------------|-------------------------------------|
| `planner`          | Convierte una necesidad en `spec.md` (con «Enfoque técnico»), `plan.md` cuando aplica y `tasks.md` | `specs/` |
| `architect`        | Valida fronteras, dependencias y coherencia con diagramas; ADRs y DF-xx; aprueba `plan.md` cuando existe | `docs/adr/`, `docs/sdd/architecture.md`, sección de aprobación del plan |
| `developer`        | Implementa tareas en orden, con pruebas primero                     | `apps/`, `packages/`, migraciones   |
| `tester`           | Traduce criterios de aceptación a pruebas y verifica la spec        | `**/test/**`, `**/*.spec.ts`, `e2e/`, sección «Verificación» de `review.md` |
| `security-auditor` | Aislamiento entre cuentas, autorización, privacidad, secretos        | `test/isolation/`, sección «Seguridad» de `review.md` |
| `ui-designer`      | Mockups, capturas, sistema de diseño Cielo Sereno y auditoría de UI | `docs/design/mockups/`, `docs/design/capturas/`, `ui-guidelines.md`, sección «UI» de `review.md` |
| `reviewer`         | Cierra `review.md`: ensambla verificación/seguridad/UI y agrega bloqueantes, importantes y sugerencias | `review.md` |

## Módulos (según los diagramas de clases)

`identity` (M1) · `storage` (M2) · `access` + `sharing` (M3) · `billing` (M4) · `editing` (M5) · `intelligence` (M6) ·
`optimizer` (M7) · `backoffice` (M8) · transversales `shared`, `audit`, `realtime`, `notifications`.
Usa los nombres de clases y puertos de los diagramas (`FileService`, `IObjectStorage`, `PermissionResolver`…).
Clases en inglés; tablas y columnas en español como el E-R.

## Stack (resumen)

Monorepo pnpm · **Frontend** Next.js + TypeScript + Tailwind v4 + shadcn/ui, sistema de diseño **Cielo Sereno** (Inter) · **Backend** NestJS + TypeORM ·
**Worker** NestJS + BullMQ · **Datos** PostgreSQL + pgvector · **Objetos** MinIO (S3) · **Cola/caché** Redis ·
**Tiempo real** Socket.IO · **Edición** ONLYOFFICE Docs (solo `.docx`) · **LLM** gemini-3.5-flash + gemini-embedding
(detrás de puertos propios) · **Auth** Passport JWT + Argon2id · **Pagos** simulación propia ·
**Procesamiento** Ghostscript, qpdf, libvips · **Infra** Docker + Traefik · **Observabilidad** Pino + Prometheus + Grafana ·
**Pruebas** Jest, Supertest, Testcontainers, Playwright, k6 · **CI/CD** GitHub Actions.

## Comandos del repositorio

> Node 22 (`.nvmrc`, `engine-strict`) y pnpm 10 por corepack. Los agentes usan estos comandos tal cual.
> Compose local sin perfiles levanta `postgres`, `redis`, `minio`, `minio-init`, `traefik` y `mailpit`;
> ONLYOFFICE solo con `--profile onlyoffice`; las apps corren en el host con `pnpm dev` (perfil `apps` opcional).

```bash
pnpm install
cp .env.example .env
docker compose up -d                        # Postgres, Redis, MinIO, Traefik, Mailpit
docker compose --profile onlyoffice up -d   # + ONLYOFFICE Docs (solo para edición, spec 016)
pnpm dev                                    # web (3002) + api (3000) + worker (3001, salud interna)
pnpm lint && pnpm typecheck                 # verificaciones estáticas
pnpm test                                   # unitarias
pnpm test:int                               # API + integración (Testcontainers)
pnpm test:isolation                         # aislamiento (bloqueante)
pnpm test:e2e                               # Playwright (marcador hasta 000b/023)
pnpm env:check                              # .env.example vs. esquemas de configuración (CA-19)
pnpm --filter api migration:generate -- <nombre>
pnpm --filter api migration:run | migration:revert
pnpm seed                                   # corpus sintético (marcador hasta 005/019)
```

## Prohibiciones duras (cualquier agente)

- Ningún rol interno (Administrador, Soporte, Operador) accede a **contenido** ni vistas previas de archivos. No existe la suplantación.
- Todo servicio que toca datos de un usuario recibe `actor: Actor`, y la consulta filtra con `accessibleNodes(actor)`. No se filtra después de consultar.
- Las bitácoras nunca contienen contenido de archivos, nombres de archivo, contraseñas, tokens ni claves de enlaces.
- La clave del LLM vive en variables de entorno del backend. Nunca llega al navegador.
- `synchronize: false` siempre. Todo cambio de esquema es una migración versionada y reversible.
- Solo `.docx` se edita en línea. No se implementa nada listado en «Fuera de alcance» (`product-context.md` §9).
- No se agrega una dependencia significativa sin un ADR.
- Código, specs y diagramas no pueden contradecirse: si te apartas del diagrama de clases o del E-R, registra o actualiza el hallazgo en `design-findings.md`.
- Tamaños en bytes siempre `bigint`; tokens y claves siempre como hash.
- En la UI no hay colores escritos a mano: solo tokens de `ui-guidelines.md`. Contraste AA por encima de cualquier mockup.
- `apps/web` nunca importa de `docs/design/mockups/`; los mockups son referencia.
- Nadie aprueba su propio trabajo: el revisor humano de un PR es distinto del autor. Única excepción: los PRs del diseñador principal (`docs/sdd/workflow.md` §7.1).

## Estado del proyecto

| Fase | Semanas        | Entrega         | Contenido principal                                                   |
|------|----------------|-----------------|-----------------------------------------------------------------------|
| 0    | 28/08 – 10/09  | 11/09 requisitos| Requisitos, casos de uso, UML, E-R, mockups                           |
| 1    | 11/09 – 29/09  | 30/09 (30 %)    | Auth, roles, bitácoras, almacenamiento, cuotas (CI/CD y staging desde el 30/09: `workflow.md` §7.2) |
| 2    | 01/10 – 13/10* | 14/10* (50 %)   | CI/CD y staging (desde el 30/09), planes y pagos, compartición, versionado, tiempo real, edición .docx, búsqueda |
| 3    | 09/10 – 22/10  | 23/10 (80 %)    | Indexación, agente con citas, optimizador, métricas, carga y aislamiento |
| 4    | 23/10 – 06/11  | Exposición final| Pulido, accesibilidad, manuales, E2E, ensayo de demo                  |

\* La entrega de la Fase 1 se movió al 30/09/2026. Las fechas de la Fase 2 son estimadas (dos semanas desde esa
entrega) y las de las Fases 3 y 4 se reprograman cuando el curso las confirme.

Cada fase reserva el **20 %** para refactorizar y probar. Actualiza esta tabla y `specs/README.md` al cerrar cada fase.
