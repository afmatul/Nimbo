# Guía del repositorio

Lectura corta de cómo está armado Nimbo. No sustituye a `docs/sdd/architecture.md` ni a `specs/README.md`: si algo no coincide, manda la spec y la arquitectura.

Fecha: 2026-09-30.

## La spec 005, en corto

No hay ramas `feat` de la 005. Solo existe `spec/005-carga-y-descarga`.

Ahí están la spec y el plan, ya cerrados, y los mockups. Falta `tasks.md`. No hay pull request y no hay código de subir o bajar archivos. La rama va detrás de `main` (en `main` ya entraron el registro y los roles).

Se puede seguir sobre esa rama. El paso que toca es escribir las tareas, no programar todavía.

## Estructura del repo

Es un monorepo: un solo repositorio con varias aplicaciones.

```
nimbo/
├─ apps/
│  ├─ web/          # lo que ve el usuario (Next.js)
│  ├─ api/          # el servidor HTTP (NestJS). Aquí viven los módulos
│  └─ worker/       # otro proceso, mismo código de negocio, para trabajos en segundo plano
├─ packages/
│  ├─ contracts/    # tipos compartidos entre web y api
│  └─ config/       # reglas de lint, TypeScript y pruebas
├─ specs/           # una carpeta por spec (005, 006a, …)
├─ docs/            # arquitectura, ADR, diseño
├─ infra/           # configuración de Traefik, MinIO, etc.
└─ compose.yml      # levanta Postgres, Redis, MinIO y el resto
```

Dentro de `apps/api/src/modules/` cada módulo (por ejemplo `storage` o `identity`) se parte en capas:

- `domain`: reglas, sin base de datos ni HTTP.
- `application`: los services. Orquestan el caso de uso.
- `infrastructure`: TypeORM, MinIO, Redis, colas.
- `presentation`: los controllers. Reciben la petición y llaman al service.
- `index.ts`: lo único que otros módulos pueden importar.

## Cómo se comunican

El navegador habla con `web`. `web` llama a `api` por HTTP. Los tipos de esas llamadas salen de `packages/contracts`, para que los dos lados usen la misma forma.

Dentro de `api`, un controller no contiene reglas: llama a un service. El service no llama a MinIO ni a Postgres directo: llama a un puerto (una interfaz). La implementación de ese puerto está en `infrastructure`.

Un módulo no entra en las carpetas internas de otro. Solo importa su `index.ts`. Si dos módulos se necesitan, uno declara el puerto y el otro lo implementa. También pueden avisarse con un evento, después de guardar en la base.

Lo lento no lo hace `api` en la petición. `api` deja un trabajo en Redis (una cola). El `worker` lo toma y lo ejecuta. Los dos procesos leen y escriben en Postgres y en MinIO.

```
navegador → web → api (controller → service → puerto)
                      │
                      ├─ Postgres / MinIO
                      └─ Redis (cola) → worker → Postgres / MinIO / correo
```

## Specs, en una línea

| Spec | Qué es |
|---|---|
| 000 | Base del repo: monorepo, Docker, logger, salud, configuración. |
| 000b | Sistema de diseño de la interfaz (Cielo Sereno). |
| 001 | Registro de cuenta y verificación por correo. |
| 002 | Login, sesión y dispositivos. |
| 003 | Roles y permisos: quién puede ver qué. |
| 004 | Bitácora de acciones (auditoría). |
| 005 | Subir y bajar archivos. |
| 006 | Carpetas y papelera. |
| 006a | Catálogo de planes y sus límites (tamaño, cuota). |
| 007 | Cuota usada y explorador de archivos. |
| 008 | Ver y comparar planes. |
| 009 | Contratar, pagar y facturar. |
| 010 | Renovar, vencer y cambiar de plan. |
| 011 | Pantallas de administración y soporte. |
| 012 | Compartir archivos con otras cuentas. |
| 013 | Enlaces públicos. |
| 014 | Versiones de un archivo y restaurar una. |
| 015 | Avisos en tiempo real (Socket.IO). |
| 016 | Editar `.docx` en el navegador. |
| 017 | Vista previa de un archivo. |
| 018 | Buscar archivos. |
| 019 | Indexar el contenido para buscar y preguntar. |
| 020 | Agente que responde citando el archivo. |
| 021 | Optimizar PDF e imágenes. |
| 022 | Métricas y alertas de operación. |
| 023 | Pruebas de carga y de aislamiento entre cuentas. |
| 024 | Pulido, accesibilidad y manuales. |

En `main`, 000, 000b, 001 y parte de 003 ya tienen código. 002 tiene spec, plan y tareas, sin código. 005 y 006a tienen documentos en ramas aparte, sin código. El resto sigue pendiente.

## Glosario

**pnpm.** El gestor de paquetes del repo. Instala dependencias y corre scripts (`pnpm dev`, `pnpm test`). Sustituye a npm.

**Monorepo.** Un repositorio con varias apps (`web`, `api`, `worker`) y librerías compartidas (`packages/`).

**Spec.** Documento que dice qué debe hacer una parte del producto y cómo se acepta. El código no se escribe si la spec no está aprobada.

**Plan.** Cómo se va a construir esa spec: módulos, tablas, contratos. En la 005 ya está aprobado.

**Tasks.** La lista ordenada de tareas para implementar el plan. La 005 todavía no la tiene.

**Rama.** Una línea de commits aparte de `main`. `main` es la línea integrada. `spec/005-carga-y-descarga` es la rama de documentos de la 005.

**Pull request (PR).** La propuesta para meter una rama en `main`. La 005 no tiene uno abierto.

**ADR.** Una decisión de arquitectura escrita (por qué se eligió X). Mientras dice «Propuesto», el equipo aún no la cerró.

**Módulo.** Una parte del backend con una responsabilidad: `identity`, `storage`, `billing`, etc. Vive en `apps/api/src/modules/`.

**Service.** Clase de la capa `application` que ejecuta un caso de uso. Por ejemplo, `UploadService` iniciaría una carga. El controller lo llama; el service llama a puertos, no a la base directo.

**Controller.** Clase que recibe HTTP, valida la entrada y delega en un service. No guarda reglas de negocio.

**Puerto.** Interfaz que el service usa para no depender de una herramienta concreta. `IObjectStorage` es el puerto; `MinioStorageAdapter` es quien de verdad habla con MinIO.

**Contrato.** Tipo compartido en `packages/contracts` para que `web` y `api` describan la misma petición y la misma respuesta.

**API.** La app `apps/api`. Responde HTTP. No mueve los bytes del archivo: en la 005 solo firmaría la URL; el navegador sube y baja directo a MinIO.

**Worker.** La app `apps/worker`. No atiende al navegador. Toma trabajos de una cola en Redis y los hace aparte: enviar un correo, limpiar una carga vencida, indexar. Usa el mismo código de módulos que `api`, en otro proceso.

**Cola.** Lista de trabajos en Redis. `api` encola; el `worker` desencola. Así una petición HTTP no espera el correo ni la limpieza.

**Redis.** Memoria usada como cola y como caché.

**Postgres.** La base de datos. Tablas de usuarios, archivos, cargas, planes.

**MinIO.** Almacén de objetos, compatible con S3. Ahí van los bytes del archivo, no en Postgres.

**TypeORM.** La librería que mapea tablas de Postgres a clases. Los cambios de tablas van en migraciones, no se sincronizan solos.

**Docker Compose.** Levanta en local Postgres, Redis, MinIO y el resto con `docker compose up -d`. Las apps (`pnpm dev`) corren en la máquina, no dentro de ese compose, salvo que se use el perfil `apps`.

**Actor.** Quién hace la acción (usuario y rol), sacado del token. Los services lo reciben y las consultas filtran con eso, para no mezclar cuentas.

**RLS.** Reglas dentro de Postgres que impiden leer filas de otra cuenta, aunque la consulta esté mal escrita.
