# Plan 012b — Diálogo «Compartir», lista de accesos y «Compartidos conmigo» (web)

> Spec: `./spec.md` · Estado del plan: Propuesto
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico
- Solo web. Carpeta nueva `apps/web/src/features/sharing/` (M3b web) con el cliente de la API, los hooks de estado y los
  componentes de las dos superficies: el modal `ShareDialog` (con `AccessList`) y la página `ReceivedSharesView`.
- La API es la de la 012 (cinco rutas, §4). No hay backend, migración ni contrato nuevo aquí: los esquemas
  (`accessListSchema`, `receivedSharesSchema`, `shareRequestSchema`) y `accessLevel` salen de `@nimbo/contracts` (012 T-01, T-04, T-11).
- El cliente HTTP reutiliza `StorageHttp`/`parseResponse` y `StorageRequestError` de `features/storage` (mismo patrón que
  `features/intelligence/indexing-api.ts`); no se crea otro cliente (DRY).
- **Una sola regla de permisos en pantalla** (spec RN-1): `accessLevel !== 'OWNER'` oculta «Compartir», «Accesos» y toda
  escritura (renombrar, mover, eliminar, subir, nueva carpeta, versiones); un Editor conserva «Editar» en `.docx` (016) y un
  Lector abre y descarga (012 CA-14). Nada más decide permisos; el servidor revalida.
- Los textos salen de un catálogo por `code` (`share-messages.ts`, spec RN-2); las acciones correctivas reutilizan
  `retryAdvice` de `storage` para `429` y ofrecen «Actualizar lista» ante `SHARING_SHARE_NOT_FOUND`.
- Sin estado global ni librería nueva: cada hook usa `useState`/`useEffect` como los de `storage` (YAGNI, sin caché ni SWR).
- «Compartidos conmigo» reutiliza el ítem del menú que ya existe (`DEFAULT_NAV_ITEMS`, hoy `#compartidos`) y abre
  lo compartido con las rutas de la 006 (`folderPath`, `fileDetailPath`), sin pantallas nuevas de contenido.

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| web/sharing (cliente) | `features/sharing/sharing-api.ts`, `routes.ts`, `index.ts` | `createSharingApi(http)`: `share`, `listAccess`, `revoke`, `listReceived`, `leave`, validando con los esquemas de contratos; `SHARED_WITH_ME_PATH = '/compartidos'`; `index.ts` exporta lo que usan `storage` y las páginas |
| web/sharing (textos) | `features/sharing/share-messages.ts` | Catálogo `code` → `{ título, acción }` en tuteo: `SHARING_*`, `STORAGE_ACCOUNT_READ_ONLY`, `SHARED_TOO_MANY_REQUESTS` (con la espera), `STORAGE_NODE_NOT_FOUND`, desconocido/red |
| web/sharing (estado) | `features/sharing/hooks/use-access-list.ts`, `use-received-shares.ts` | Cargan, exponen `status` (`loading`/`ready`/`error`) y las mutaciones (`share`, `changeLevel`, `revoke`, `leave`) con su `pending`/`error`; tras cada una refrescan la lista (no se recarga la página) |
| web/sharing (diálogo) | `components/share-dialog.tsx`, `share-form.tsx` | Modal (`ui/dialog`, foco atrapado y devuelto al disparador): correo + nivel (Lector/Editor), progreso > 2 s, éxito; en error conserva lo escrito y muestra el mensaje con su acción |
| web/sharing (accesos) | `components/access-list.tsx`, `access-row.tsx` | Estados cargando, vacía, con personas y error de carga; fila con nombre, correo, nivel (selector; en solo lectura solo «Lector», vía `useReadOnlyAccount`) y origen; «Quitar acceso» con confirmación (`ui/alert-dialog`); heredada sin botón y con «Viene de «<carpeta>»» |
| web/sharing (recibidos) | `components/received-shares-view.tsx`, `received-share-row.tsx`, `leave-share-dialog.tsx` | Página «Compartidos conmigo»: cargando, vacía, lista (nombre, tipo, quién compartió, nivel, fecha; enlace a `folderPath`/`fileDetailPath`), error de carga; «Salir» con confirmación, progreso, éxito y error |
| web/app | `app/(app)/(cliente)/compartidos/page.tsx` | Página del layout del Cliente (los roles internos no llegan: 003 D-5); solo monta `ReceivedSharesView` |
| web/nimbo (000b) | `components/nimbo/app-layout.tsx` (+ `app-layout.spec.tsx`) | El ítem «Compartidos» apunta a `SHARED_WITH_ME_PATH` en vez de `#compartidos` y queda activo en esa ruta |
| web/storage (de Adrián) | `features/storage/components/file-row-menu.tsx`, `folder-row-menu.tsx`, `my-files.tsx`, `file-detail-view.tsx` | Leen `accessLevel` de la 012: sin `OWNER` ocultan escrituras, subida y «Nueva carpeta»; con `OWNER` suman «Compartir», que abre `ShareDialog` (montado en `my-files` y en la ficha) |
| web/sharing (pruebas) | `features/sharing/test-sharing.ts` | Doble de `StorageHttp` y fábricas de entradas, como `intelligence/test-indexing.ts` |

9 filas (filas, no archivos: cada una agrupa lo que cambia junto).
- **Puertos y abstracciones nuevas: ninguno.** `SharingApi` es el tipo que devuelve `createSharingApi`, con una sola
  implementación, igual que `FoldersApi`; los hooks lo reciben para probarlos con el doble (Art. V.2(b)). Sin clases ni contexto nuevos.
- **Dependencias nuevas entre módulos web:** `sharing → storage` (cliente HTTP, rutas, `useReadOnlyAccount`) y `storage → sharing`
  (montar el diálogo). Es el mismo vaivén que ya hay con `intelligence`; el montaje usa solo `index.ts` de `sharing`.
- **Reutilizar antes de crear:** filas y tablas del explorador (`node-table`, `node-rows`) para la lista de recibidos si
  encajan sin cambios; `use-pending-confirm` para las confirmaciones; `ui/alert-dialog`, `ui/dialog`, `ui/radio-group`.
  Si la tabla del explorador no sirve, `received-share-row.tsx` es una fila simple, no una tabla genérica nueva (YAGNI).
- **Estados por componente** (mapa para el `ui-designer`, spec §6): `ShareDialog` = default, cargando, vacía, compartiendo, éxito, errores
  por `code`; `AccessList` = lista-accesos, nivel cambiado, acceso heredado, confirmar quitar, quitando, error de carga;
  `ReceivedSharesView` = cargando, con-elementos, vacía, error-carga, menu-fila, confirmar-salir, saliendo, salió, error-salir, solo-lectura.

## 3. Datos
No aplica: la web no tiene tablas ni migraciones. Nada se guarda en `localStorage` ni `sessionStorage`; el correo vive
solo en el estado del formulario y se descarta al cerrar el diálogo.

## 4. Contratos
Rutas de la 012 que consume esta spec (las define y prueba la 012; aquí solo se llaman):

| Método | Ruta | Quién la llama | Errores que la web traduce (`code`) |
|---|---|---|---|
| POST | `/api/v1/shares` | `share-form` (crear o cambiar nivel) | `SHARING_INVALID_LEVEL`, `SHARING_RECIPIENT_NOT_FOUND`, `SHARING_CANNOT_SHARE_WITH_SELF`, validación con `fields`, `STORAGE_NODE_NOT_FOUND`, `STORAGE_ACCOUNT_READ_ONLY`, `SHARED_TOO_MANY_REQUESTS` |
| GET | `/api/v1/shares?nodeType&nodeId` | `use-access-list` | `STORAGE_NODE_NOT_FOUND`, red |
| DELETE | `/api/v1/shares/:shareId` | `access-row` (Quitar acceso) | `SHARING_SHARE_NOT_FOUND` |
| GET | `/api/v1/shares/received` | `use-received-shares` | red |
| DELETE | `/api/v1/shares/received/:shareId` | `leave-share-dialog` (Salir) | `SHARING_SHARE_NOT_FOUND`, red |

Cambiar el nivel es `POST /shares` otra vez (012 S-2). El correo viaja solo en el cuerpo. Sin eventos ni Socket.IO.

## 5. Seguridad y operación
- **Toca datos de un cliente: sí, solo por la 012.** No hay consultas nuevas, así que no hay tarea de aislamiento aquí; los
  casos de aislamiento de CA-21 a CA-23 viven en `sharing.iso-spec.ts` (012 T-10, T-11). La web no filtra ni decide: oculta por `accessLevel`.
- Correos de terceros solo en el modal del propietario; nada en URL, almacenamiento local, `console` ni mensajes de error.
  «Compartidos conmigo» muestra nombre visible del propietario, no su correo; nombres de archivo solo en pantalla.
- Las respuestas llegan con `Cache-Control: no-store` (012); la web no las cachea fuera del estado del hook.
- Accesibilidad (RNF-13/14): `role="dialog"` con título, foco al primer campo y de vuelta al disparador, `aria-live` para
  éxito y error, selector de nivel con etiqueta, objetivos táctiles de 44 px a 360 px, texto con tokens de `ui-guidelines.md`
  (sin colores escritos a mano), progreso visible tras 2 s. El botón principal usa el token corregido (DF-41).
- Bitácoras y métricas: ninguna en la web.

## 6. Estrategia de pruebas (por riesgo)
Cada tarea de lógica empieza por su prueba en rojo. Sin repetir un CA en tres capas; sin E2E propio (la demo es la tarea humana).

| CA | Nivel | Archivo |
|---|---|---|
| CA-3, CA-11 (cada `code` con texto y acción) | unit | `features/sharing/share-messages.spec.ts` |
| CA-2, CA-5, CA-10 (rutas, cuerpo sin correo en la URL, parseo de contratos) | unit | `features/sharing/sharing-api.spec.ts` |
| CA-1, CA-2, CA-3 | web | `components/share-dialog.spec.tsx` (lista cargando/vacía/con personas, compartir feliz, un error con valores conservados, `429`) |
| CA-4, CA-5 | web | `components/access-list.spec.tsx` (cambiar nivel, solo lectura solo baja, confirmar y quitar, heredada sin botón) |
| CA-6, CA-9 | web | `features/storage/components/file-row-menu.spec.tsx`, `folder-row-menu.spec.tsx` (casos nuevos por nivel) |
| CA-8, CA-9, CA-10, CA-11 | web | `components/received-shares-view.spec.tsx` (cargando, vacía, lista con enlaces, error de carga, salir feliz y `SHARING_SHARE_NOT_FOUND`, salir en solo lectura) |
| CA-8 (entrada del menú) | web | `components/nimbo/app-layout.spec.tsx` (el ítem enlaza a `/compartidos`) |
| CA-7 | web | `features/sharing/a11y.spec.tsx` (axe sobre ambas superficies y todos los estados; foco; patrón de `storage/a11y.spec.tsx`) |

Las suites actuales de `storage` y `app-layout` siguen en verde sin cambio para el propietario (`accessLevel: 'OWNER'`).
`pnpm lint`, `pnpm typecheck` y `pnpm test`; `pnpm test:int`/`test:isolation` no cambian (no hay backend).

## 7. Riesgos y coherencia con el diseño
- **R-1 Dos pantallas en una spec** (`workflow.md` §4.1 pide partir): Adrián decidió el 2026-10-30 que «Compartidos conmigo» entra
  aquí. Corte listo si el desarrollo pasa de 3 días: **012c** = «Compartidos conmigo» (T-05 a T-07), sin tocar el resto.
- **R-2 Mockups faltantes:** el diálogo solo tiene `default` y la vista nueva no tiene mockup ni fila en `ui-guidelines.md` §7.
  Mitigación: P-3 y `/mockup` antes de `Lista`; las tareas T-05 a T-07 no empiezan sin esa decisión.
- **R-3 Dependencia de la 012:** necesita `accessLevel` (012 T-04) y las rutas recibidas (012 T-11). Mientras llegan, las
  pruebas usan el doble de `StorageHttp`; el recorrido humano (T-09) exige la 012 integrada.
- **R-4 Permisos duplicados en pantalla:** mitigado con una sola condición (`accessLevel`) y sin lógica por rol; el servidor responde `404` si se cuela una acción (012 CA-14).
- **R-5 Módulos ajenos:** se tocan `features/storage` (de Adrián) y `app-layout.tsx` (de Fátima desde 000b); ver §8.
- **Desviaciones de los diagramas:** ninguna. No se agrega DF.
- **Pendientes** (`pendientes.md`): **PD-138** se acota: la vista y «Salir» entraron; siguen sin RF el aviso al destinatario, su
  actividad y los vencimientos (Adrián decide si hay RF). **PD-139** sigue abierto.
- **ADR requeridos:** ninguno (sin dependencias nuevas).
- Documentos a actualizar en el PR: `ui-guidelines.md` §7 (fila «Compartidos conmigo», a cargo de `ui-designer`) y el README de `features/sharing` si existe.

## 8. Aprobación
- `architect`: no aplica (sin puerto entre módulos, tecnología nueva ni cambio de arquitectura)
- Dueños de módulo: cambios en `features/storage` (de Adrián) — por autorizar por Adrián a Fátima (precedente 012 P-3)
- Adrián: Propuesto — sin aprobar
