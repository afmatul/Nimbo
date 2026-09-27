# ADR-0002 — NestJS + TypeORM con migraciones manuales y `synchronize: false` fijo

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-09-26, Adrián) |
| Fecha | 2026-09-15 |
| Decisores | Adrián (architect), equipo Nimbo |
| Specs relacionadas | 000 (D-1, D-14, CA-10 a CA-12); todas las que crean tablas |

## Contexto

D-1 fija NestJS 11 y TypeORM 0.3 como decisión del equipo. Este ADR registra por qué esa combinación es defendible y
cómo se gobierna el esquema: RNF-10 exige migraciones versionadas y reversibles; el E-R (`docs/design/diagramas/`)
usa tablas en español y `snake_case` mientras las clases están en inglés (`conventions.md`); `design-model.md` §5
obliga tipos concretos (`bigint`, centavos, `jsonb`, `vector(768)`, `tsvector`) que un generador automático no
elige bien; y Art. IX exige RLS con `SET LOCAL app.actor_id`, que solo se expresa en SQL.

## Opciones consideradas

1. **NestJS + TypeORM 0.3, entidades ORM separadas del dominio, migraciones escritas/revisadas a mano, `synchronize: false` literal**
   - Pros: los cuatro integrantes conocen Nest; TypeORM permite `@Entity('archivo')` + `@Column({ name: 'creado_en' })`
     para mapear inglés ↔ español sin tocar el dominio; `migration:generate` sirve de borrador pero el archivo se
     revisa (tipos de §5, índices, RLS, `down` real); `QueryBuilder`/SQL crudo para `accessibleNodes` y `pgvector`.
   - Contras: TypeORM tiene aristas (transacciones, `relations`), y el mapeo ORM ↔ dominio añade *mappers*.
2. **NestJS + Prisma**
   - Pros: tipado excelente, migraciones declarativas.
   - Contras: `vector(768)`, `tsvector` y RLS requieren SQL «unsupported» y `Unsupported()` en el esquema; el mapeo
     de nombres en español exige `@map` en cada campo; no hay entidades de dominio, lo que empuja a usar los tipos
     generados en todas las capas (rompe Art. VIII.2). Contradice D-1.
3. **NestJS + Kysely / SQL a mano**
   - Pros: control total del SQL y tipado.
   - Contras: sin migraciones integradas ni decoradores; más código de mapeo; curva de aprendizaje para tres de los
     cuatro integrantes; contradice D-1.
4. **`synchronize: true` en desarrollo y migraciones solo en producción (posponer el rigor)**
   - Contras: el esquema local diverge del de CI/staging; las migraciones se escriben tarde y sin `down`; CA-10 a
     CA-12 dejan de tener sentido. Viola RNF-10.

## Decisión

Opción 1, con estas reglas que el plan 000 hace ejecutables:

- `synchronize: false` como literal en `buildDataSourceOptions` (no se lee ninguna variable; CA-10).
- Una única fuente de datos (`shared/infrastructure/persistence/data-source.ts`) usada por `api`, `worker`, la CLI
  de TypeORM y `scripts/migrate.ts`; `entities` se descubren por glob de `modules/**/infrastructure/persistence/*.orm-entity.*`.
- Migraciones en `apps/api/src/migrations/YYYYMMDDHHmmss-verbo-objeto.ts`, siempre con `down` funcional; el job
  `migrations` de CI ejecuta `run → revert → run` (CA-11) y falla si el `down` no revierte (CA-12).
- Tabla de control `migracion` (`migrationsTableName`), en español singular como el resto del esquema.
- Tipos de columna según `design-model.md` §5; una migración que se aparte del E-R actualiza el diagrama en el
  mismo PR (`conventions.md` §BD).
- Semillas de catálogo (planes) por migración; datos de demo por `pnpm seed`.
- Las entidades ORM viven solo en `infrastructure/persistence`; el dominio no importa `typeorm` (lint, ADR-0008).

## Consecuencias

- Positivas: esquema reproducible en local, CI, staging y producción; el `down` real hace posible el rollback (RNF-20);
  el mapeo inglés/español queda en un solo lugar.
- Negativas / deuda aceptada: *mappers* ORM ↔ dominio en cada módulo (se permite usar la entidad ORM directamente en
  módulos triviales si el plan lo justifica, `architecture.md` §4); `migration:generate` produce borradores que hay
  que corregir a mano.
- Cómo sabremos si fue un error: si una migración integrada en `main` tiene que editarse porque su `down` no funcionó
  en staging, o si los *mappers* superan en tamaño a la lógica que protegen en más de un módulo.
