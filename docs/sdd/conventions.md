# Convenciones

## Idioma
- Código (clases, métodos, variables, nombres de archivo): **inglés**, igual que el diagrama de clases.
- Tablas y columnas: **español** `snake_case`, igual que el diagrama E-R. El mapeo vive solo en las entidades TypeORM.
- UI, mensajes de error al usuario, specs, ADRs, manuales, descripción de commits y PRs: **español**.
- Nombres de clases, puertos y métodos: los de `docs/sdd/design-model.md`. Si necesitas uno nuevo, agrégalo también al diagrama.
- Fechas en specs, pendientes, hallazgos y ADRs: `AAAA-MM-DD` en hora local de Guatemala (UTC−6), no la hora UTC de GitHub.

## TypeScript
- `strict: true`, `noUncheckedIndexedAccess: true`. Sin `any` implícito.
- Archivos en `kebab-case` con el sufijo del estereotipo (tabla en `design-model.md` §1):
  `files.controller.ts`, `upload.service.ts`, `renewal.job.ts`, `indexing.processor.ts`, `presence.gateway.ts`,
  `roles.guard.ts`, `i-object-storage.port.ts`, `minio-storage.adapter.ts`, `file.entity.ts`, `archivo.orm-entity.ts`,
  `savings-estimate.vo.ts`, `access-level.enum.ts`, `file-version-created.event.ts`.
- Clases `PascalCase`; funciones y variables `camelCase`; constantes de módulo `SCREAMING_SNAKE_CASE`.
- Interfaces de **puertos** con prefijo `I`, como en los diagramas: `IObjectStorage`, `IClock`. Viven en `application/ports/*.port.ts` del módulo que los declara (decisión de Adrián en la revisión de la 009, 2026-10-14). Token de inyección: `I_OBJECT_STORAGE` (símbolo exportado junto a la interfaz). El prefijo es **solo** para puertos (contratos que la infraestructura implementa); tipos de datos, DTOs, props y contratos zod van sin `I` (`Actor`, `HealthReadyResponse`, `Env`).
- Servicios de aplicación como en los diagramas (`FileService`, `UploadService`…): métodos públicos por caso de uso, con `actor: Actor` como primer parámetro cuando actúan sobre datos de un usuario. Si un servicio supera ~7 métodos públicos o mezcla razones de cambio, se divide (SRP) y se actualiza el diagrama.
- Retornos explícitos en funciones exportadas.
- Nada de lógica en constructores ni en decoradores.

## Errores
- Errores de dominio extienden `DomainError` con `code` estable (`STORAGE_QUOTA_EXCEEDED`).
- Un único `DomainExceptionFilter` traduce `code` → HTTP. Respuesta:
  `{ "code": "...", "message": "texto en español con acción correctiva", "correlationId": "..." }`.
- Nunca se filtra el stack ni detalles internos al cliente.

## API REST
- Prefijo `/api/v1`. Recursos en plural e inglés: `/files`, `/folders`, `/shares`, `/subscriptions`.
- Validación con esquemas zod de `packages/contracts` y `ZodValidationPipe` de `shared` (ADR-0020); contratos públicos
  en `packages/contracts`.
- Paginación por cursor en listados; única excepción, los listados internos de `backoffice` (número de página con `total`, DF-66). Fechas ISO-8601 UTC.
- OpenAPI generado por `@nestjs/swagger`; el PR que cambia un endpoint actualiza el contrato.
- Operaciones sensibles con `@Throttle` (login, recuperación, enlaces con contraseña, agente).

## Base de datos
- Tablas en español, `snake_case` y **singular**, como en el E-R: `usuario`, `archivo`, `version_archivo`. PK `id uuid`.
- Marcas de tiempo en español como en el E-R: `creado_en`/`creada_en`, `actualizado_en`, `eliminado_en` (papelera), `revocado_en`, `expira_en`.
- Tipos obligatorios: tabla en `design-model.md` §5 (`bigint` para bytes, dinero en centavos, `jsonb` para procedencia, `vector(768)`, `timestamptz`).
- FKs `<entidad>_id` (`archivo_id`, `sesion_edicion_id`); índices `idx_<tabla>_<columnas>`; únicos `uq_<tabla>_<columnas>`.
- Migraciones: `YYYYMMDDHHmmss-verbo-objeto.ts` (`20260915120000-crear-archivo.ts`), siempre con `down`.
- Una migración que se aparta del E-R requiere actualizar el diagrama E-R en el mismo PR.
- Una migración por cambio lógico. Nunca editar una migración ya integrada en `main`.
- Semilla de planes por migración (datos de catálogo); datos de demo por script `pnpm seed`.
- Índices declarados en la spec/plan cuando una consulta los necesita.

## Bitácoras y métricas
- `this.logger.info({ event: 'upload.completed', fileId, sizeBytes }, 'Carga completada')`.
- Campos prohibidos: contenido, nombre de archivo, contraseña, token, clave de enlace, prompt completo del usuario.
- Métricas Prometheus: `nimbo_<modulo>_<cosa>_<unidad>` (`nimbo_storage_upload_bytes_total`).

## Pruebas
- Unitarias junto al código: `quota-policy.spec.ts`.
- Integración en `apps/api/test/int/<modulo>/*.int-spec.ts`.
- Aislamiento en `apps/api/test/isolation/*.iso-spec.ts`.
- E2E en `e2e/<flujo>.e2e.ts`. Carga en `load/<escenario>.k6.js`.
- Nombre de prueba de aceptación: `'CA-n: <comportamiento esperado>'`.
- Estructura Arrange / Act / Assert; builders para datos (`aFile().ownedBy(user).build()`), nada de fixtures gigantes.
- Sin `sleep`; usar `Clock` falso y esperas explícitas.

## Git
- Trunk-based: `main` siempre desplegable; ramas cortas (≤ 3 días).
- Ramas: `spec/NNN-slug` (solo documentos de spec), `feat/NNN-slug`, `fix/NNN-slug`, `chore/slug`.
- **Conventional Commits** con alcance de módulo y descripción en español:
  `feat(storage): rechazar cargas que exceden la cuota [NNN T-04]`
  Tipos: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `ci`, `perf`.
- Un commit por tarea de `tasks.md` cuando sea posible.
- PR pequeño (guía: < 400 líneas cambiadas sin contar pruebas y migraciones).
- Merge por squash. Etiquetas `vX.Y.Z` para producción.

## Pull requests
- Usa `.github/pull_request_template.md`.
- Requiere: CI verde (lint, typecheck, unit, int, isolation, migraciones) + `review.md` del subagente sin bloqueantes + 1 aprobación humana de alguien distinto del autor. Excepciones en `workflow.md` §7: el diseñador principal aprueba sus propios PRs (§7.1), y hasta que exista el CI (desde el 30/09/2026) la verificación es local (§7.2).
- El dueño del módulo no puede ser el único revisor de su propio módulo.

## Frontend
- Componentes `PascalCase.tsx`; hooks `use-algo.ts`.
- Formularios con `react-hook-form` + esquema de `packages/contracts`.
- Todos los textos en español (tuteo); errores resueltos desde el catálogo por `code`.
- Tailwind v4 + shadcn/ui con los tokens de `docs/sdd/ui-guidelines.md` §3 (única fuente: `apps/web/src/app/globals.css`).
- **Prohibido** usar hex, `rgb()` o valores arbitrarios en componentes (`bg-[#…]`, `p-[13px]`); excepciones listadas en `ui-guidelines.md` §5.
- Antes de crear un componente, busca en `components/ui` y `components/nimbo`.
- Íconos: `lucide-react` (el que trae shadcn). Cifras con `tabular-nums`.
- La UI se construye a partir del mockup de `docs/design/mockups/`, pero nunca importa ni copia su código tal cual.

## Mockups y capturas
- Código del mockup: `docs/design/mockups/<modulo>/<pantalla>/`.
- Capturas: `docs/design/capturas/<modulo>/<pantalla>/<pantalla>--<estado>--<360|1440>.png`.
- Capturas de pruebas automáticas: `e2e/__screenshots__/` (no se mezclan con las de diseño).
- Cambiar un mockup implica regenerar sus capturas en el mismo PR.
- Los mockups quedan fuera del workspace de pnpm, del lint de la app y del build.

## Variables de entorno
- Validadas al arrancar (esquema en `config/`). Si falta una, el proceso no inicia.
- `.env.example` actualizado en el mismo PR que agrega una variable.
- Secretos nunca en el repo ni en variables `NEXT_PUBLIC_*`.
