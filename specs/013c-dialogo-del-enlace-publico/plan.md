# Plan 013c — Diálogo del enlace público (web)

> Spec: `./spec.md` · Estado del plan: Aprobado (Adrián, 2026-11-11)
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.
> D-1 a D-10, I-2 e I-5 resueltas por Fátima (2026-11-10, spec §9); revisión de documentos aplicada (I-1 a I-8, S-1 a S-9); auditoría del PR #107 aplicada (M-2 a M-4, 2026-11-11).

## 1. Resumen técnico
- **Solo web, un PR** (`feat/013c-dialogo-del-enlace-publico`). Sin backend, migración ni contrato nuevo: las tres rutas
  del propietario y sus esquemas son de la 013 (`createPublicLinkSchema`, `currentPublicLinkSchema`,
  `createdPublicLinkSchema`, `PUBLIC_LINK_EXPIRY_OPTIONS`, `PUBLIC_LINK_DEFAULT_EXPIRY_DAYS`).
- **Cliente (DRY, S-8):** `SharingApi` (012b) suma tres métodos sobre el mismo `StorageHttp` con sesión
  (`useSessionSharingApi`) y pasa de 5 a 8. Se acepta: es la misma API de `sharing`, con el mismo `auth-fetch` y el mismo
  `StorageRequestError`; un segundo cliente repetiría todo eso. Si crece más, se parte por consumidor (Art. IV, I).
- **Cuerpo de generar (I-1):** una sola función, `publicLinkBody({ fileId, expiresInDays, password })` en
  `sharing-api.ts`, arma el cuerpo y omite `password` vacía (CA-4). La usan el formulario antes de validar con
  `createPublicLinkSchema.safeParse` (como `validate` de `share-form.tsx`) y `createPublicLink`. Así el `422` de longitud
  da el texto de la API (`SHARING_FIELD_MESSAGES.INVALID_PASSWORD`, 013b CA-16, spec S-2) sin regla duplicada.
- **Estado:** `usePublicLink(api, fileId)` con el patrón de `useAccessList` (una lectura por intento, respuesta vieja
  descartada). Expone la lectura (`loading` / `error` / `ready` con `PublicLinkSummary | null`), `generated` (URL y
  resumen recién creados, solo en memoria, RN-1), `create`, `revoke` y `reload`. `generated` se limpia al revocar; con la URL a la
  vista no se ofrece «Generar otro enlace» (mockup `enlace-generado`), así que no hay más caso que limpiar (S-5, I-2).
- **Vista:** `PublicLinkSection` decide qué mostrar según la lectura, el modo local (`idle`, `form`, `confirm-replace`,
  `confirm-revoke`) y `useReadOnlyAccount` (D-6, como `access-row`). La solo lectura se muestra con `ReadOnlyBanner` de
  `components/nimbo/`, como «Compartidos conmigo» (012b), y no con un `Alert` propio (M-3). Revocar y reemplazar usan `usePendingConfirm`
  (progreso a los 2 s y error por `code`, S-5). El formulario (`PublicLinkForm`) y el campo de la URL
  (`GeneratedLinkField`) son componentes propios para que cada archivo quede corto (Art. VII.2).
- **Error de contraseña (I-5):** solo junto al campo, como 013b CA-4: `Input` inválido, mensaje debajo asociado con
  `aria-describedby` y foco. No pasa por `ShareErrorAlert` ni suma una acción.
- **Escape, la X y el clic fuera (CA-11, I-6, S-2, S-3, M-2):** Radix escucha Escape en el documento y también cierra
  con un clic fuera de `DialogContent`, así que un manejador dentro de la sección no detiene ninguno de los dos. Todo se
  resuelve en `DialogContent`, dentro de `ShareDialogBody`, y no en `onOpenChange` de `ShareDialog`, que no ve el
  estado de la sección:
  - `busy` vive en un `useState` de `ShareDialogBody` y la sección lo informa con `onBusyChange`. Con `busy`, la X queda
    deshabilitada, y `onEscapeKeyDown` y `onInteractOutside` hacen `preventDefault`, como `ConfirmDestructiveDialog`
    con `pending`.
  - Sin `busy`, `onEscapeKeyDown` llama al callback que la sección registra en un `useRef` (`cancelOpenPart`): cancela
    el formulario o la confirmación y devuelve `true` si había algo que cancelar; entonces se hace `preventDefault`. Con
    la URL a la vista y nada abierto devuelve `false` y Escape cierra (D-7).
  - Sin `busy`, el clic fuera se comporta como la X.
  - El contenido del diálogo se extrae a funciones propias para que ninguna pase de 30 líneas.
- **Textos por `code` (I-2, I-3, Art. VI.3):** `publicLinkMessageOf(error)` en `share-messages.ts` envuelve
  `shareMessageOf` y sobrescribe dos casos:
  - `STORAGE_NODE_NOT_FOUND`: texto de D-8, sin botón;
  - `SHARING_LINK_NOT_FOUND`: con «Actualizar».

  El `403` `STORAGE_ACCOUNT_READ_ONLY` no se muestra como aviso de error: `isReadOnlyError(error)`, en el mismo archivo,
  lo reconoce y la sección muestra `ReadOnlyBanner` sobre el formulario conservado (CA-10, M-3).
  `ShareFix` suma `reload` («Actualizar», repite la lectura) y `none` (sin botón, rótulo `null` como `wait`). «Actualizar
  lista» de 012b no cambia. El `429` y la red siguen en `shareMessageOf` (CA-12, CA-13).
- **Tono de advertencia (I-4):** `ShareErrorAlert` acepta una `variant` opcional (`error` por omisión). La sección pasa
  `warning` solo para `wait` (`429`); la solo lectura usa `ReadOnlyBanner`. Los usos de la 012b no la pasan y no cambian.
- **«Mi actividad» (CA-16, CA-17, S-4):** en `activity-labels.ts`, `public_link.created` y `public_link.revoked` se
  escriben con `self`. `public_link.downloaded` y `public_link.locked` se escriben con `staff`, cuyo sujeto es
  `activityActorLabel`. `activityActorLabel` y `activityActionLabel` miran `trigger === 'public_link'` **antes** que
  `origin === 'self'`, como hoy con `scheduled`. Sin clave nueva en `ActionText` ni cambios en `activity-event-row.tsx`.
- **PD-200 (CA-18, S-7):**
  - **Esencial:** el pedido del fragmento lleva un número explícito en lugar de la identidad de `{ token }` (m-2 del
    #105). La descarga pasa a `usePublicLinkDownload`, que descarta el `openUrl`, el fallo y «Preparando…» de un pedido
    que ya no es el vigente.
  - **Para la última cláusula de CA-18:** la ficha que usa ese hook se monta con `key` = número de pedido. Así cada
    pedido tiene su propio `usePreparingDownload` y «Descargar» en B no espera a A. Sin el `key`, la guardia basta para
    lo demás, pero B espera a que A termine (su `inFlight`). Adrián decidió mantenerlo (S-7, 2026-11-11).
  - `lib/` no cambia.

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| web/sharing (cliente) | `features/sharing/sharing-api.ts` (+ `test-sharing.ts`) | `publicLinkBody` (I-1); `currentPublicLink(fileId)` (`GET /public-links?fileId`), `createPublicLink(input)` (`POST /public-links`) y `revokePublicLink(linkId)` (`DELETE /public-links/:linkId`), validados con `currentPublicLinkSchema` y `createdPublicLinkSchema`. El doble de pruebas suma un enlace de ejemplo y una URL ficticia |
| web/sharing (textos) | `features/sharing/share-messages.ts`, `components/share-error-alert.tsx` | `publicLinkMessageOf` (I-3), `isReadOnlyError` y las acciones `reload` y `none` (§1). `ShareErrorAlert`: `variant` opcional para el tono de advertencia del `429` (I-4); `ShareFixHandlers` excluye también `none` |
| web/sharing (estado) | `features/sharing/hooks/use-public-link.ts` | `usePublicLink(api, fileId)`: lectura por intento, `generated` solo en memoria y limpiado al revocar (S-5, I-2), `create` y `revoke` que rechazan con el error de la API y releen al salir bien, `reload` |
| web/sharing (sección) | `features/sharing/components/public-link-section.tsx` | `h3` «Enlace público» (D-3) y los estados de spec §6: cargando, error, sin enlace con su ayuda y «Crear enlace público» `outline`, activo con nota y vencido con insignia neutra (`expiresAtLabel` de `lib/format-date.ts`), confirmaciones en línea (D-1) con `usePendingConfirm`, solo lectura (D-6) y `403` tardío con `ReadOnlyBanner` (M-3), avisos con `ShareErrorAlert` y `publicLinkMessageOf`; registra el callback de Escape e informa `busy` con `onBusyChange` (§1). Una región `role="status"` por mensaje, siempre presente y vacía en reposo, para que cada aviso se anuncie una sola vez (R-4, S-4 de la revisión); foco explícito cuando desaparece el botón pulsado (R-2) |
| web/sharing (formulario) | `features/sharing/components/public-link-form.tsx` | `RadioGroup` «Vence en» con `PUBLIC_LINK_EXPIRY_OPTIONS` (D-4; en el reemplazo, foco en la opción marcada), `PasswordField` «Contraseña (opcional)» de `components/nimbo/` con `autoComplete="off"`, `data-1p-ignore`, `data-lpignore`, `name` propio, la ayuda de spec §5 (R-3) y `maxLength` = `PUBLIC_LINK_PASSWORD_MAX_LENGTH`; validación con `publicLinkBody` y el contrato (I-1); error de contraseña junto al campo (I-5); «Generando…» pasados 2 s; conserva lo elegido ante un error; el botón dice «Generar enlace» o, al reemplazar, «Generar otro enlace» |
| web/sharing (URL) | `features/sharing/components/generated-link-field.tsx` | Campo «Enlace generado» de una línea y solo lectura (R-6, `text-foreground`), «Copiar enlace» con `navigator.clipboard.writeText` y «Enlace copiado» hasta la siguiente interacción (D-9); si falla, el aviso de error de CA-6 y el texto seleccionado (R-7). Recibe la función de copiar por prop, con `navigator.clipboard` por omisión, para probar el fallo |
| web/sharing (diálogo) | `features/sharing/components/share-dialog.tsx` | Monta `PublicLinkSection` solo si `target.nodeType === 'file'` (CA-2), después de `AccessList`; `useState` de `busy` y `useRef` del callback; con `busy`, `onEscapeKeyDown` y `onInteractOutside` hacen `preventDefault` y la X queda deshabilitada (§1, CA-11, M-2); contenido en funciones de ≤ 30 líneas (S-2). El comentario deja de decir «sin la sección hasta la 013» |
| web/audit (de Adrián, P-A) | `features/audit/activity-labels.ts` | `PUBLIC_LINK_LABEL` = «Alguien con el enlace»; las cuatro acciones `public_link.*` y el orden de §1 (S-4) |
| web/sharing (visitante, PD-200) | `features/sharing/hooks/use-public-link-visit.ts`, `hooks/use-public-link-download.ts` (nuevo), `components/public-link-visit.tsx` | Número de pedido en `VisitSnapshot`; `usePublicLinkDownload` (descarga, «Preparando…», resultado, guardia por pedido) sale de `use-public-link-visit.ts`; la ficha lo usa y se monta con `key` = número de pedido (§1, S-7) |
| diseño (T-01, `ui-designer`) | `docs/design/mockups/sharing/compartir/` (`_generadores/compartir/generar.js`, 24 `compartir--…html`, README), `docs/design/capturas/sharing/compartir/`, `ui-guidelines.md` §7 fila «Enlace público (diálogo…)» y §4 | Hecho por el `ui-designer`, pendiente de la aprobación de Adrián: 24 variantes a 360 y 1440 px (48 PNG, D-10), README corregido («clave» → «contraseña»), fila de §7 con los estados y, en §4, la excepción de la confirmación en línea a `ConfirmDestructiveDialog` (D-1, S-9) |

10 filas. **Archivos de producción: 12**:
- `sharing-api.ts`, `share-messages.ts`, `share-error-alert.tsx`;
- `use-public-link.ts`, `public-link-section.tsx`, `public-link-form.tsx`, `generated-link-field.tsx`, `share-dialog.tsx`;
- `activity-labels.ts`;
- `use-public-link-visit.ts`, `use-public-link-download.ts`, `public-link-visit.tsx`.

Tras la auditoría del #108 (12/11): M-2 partió la sección en `public-link-current.tsx`, `public-link-empty.tsx`,
`public-link-revoke-confirm.tsx`, `public-link-form-panel.tsx`, `success-notice.tsx`, `use-focus-on-mount.ts`,
`public-link-section-styles.ts` y los hooks `use-link-section-state.ts`, `use-generate-link.ts` y `use-revoke-link.ts`;
m-6 sumó `hooks/public-link-errors.ts`, y M-1 llevó `FieldMessage` a `components/nimbo/` y dio título por omisión a
`ReadOnlyBanner` (con permiso de Adrián para `storage/read-only-notice.tsx`, pedido en su auditoría).

Aparte: `test-sharing.ts` (apoyo de pruebas), las pruebas de §6 y los mockups y capturas de T-01. Es el límite de
`workflow.md` §4.1. Una pantalla (la sección); «Mi actividad» solo cambia textos.

**Puertos y dependencias:**
- **Puertos nuevos:** ninguno. **Abstracciones nuevas:** ninguna. `usePublicLink` y `usePublicLinkDownload` son hooks de
  una sola implementación, como `useAccessList`.
- **Dependencias nuevas entre módulos web:** ninguna. `sharing → storage` (`StorageHttp`, `useReadOnlyAccount`,
  `usePendingConfirm`), `sharing → lib` y `sharing → components/nimbo` ya existen. `audit` no importa de `sharing`.

**Reutilizar antes de crear** (buscado con Grep):
- `createSharingApi`/`useSessionSharingApi`, `parseResponse`, `shareMessageOf` y `ShareErrorAlert`, `usePendingConfirm`,
  `useReadOnlyAccount`, `ReadOnlyBanner` (como `received-shares-view.tsx`), `RadioGroup`, `Input`, `Alert`,
  `PasswordField`, `expiresAtLabel`, `RENEW_PATH` (por `ReadOnlyBanner`) y `useReturnFocus` del diálogo.
- No hay utilidad de portapapeles en `apps/web` (Grep `clipboard`: sin resultados). Se usa la API del navegador, sin
  dependencia nueva.

## 3. Datos
No aplica: sin tablas ni migraciones. La web no guarda nada en `localStorage` ni `sessionStorage`. La URL generada y la
contraseña viven solo en el estado del hook y del formulario, y se descartan al cerrar el diálogo (se desmonta, 012b).

## 4. Contratos
Sin rutas ni esquemas nuevos. Lo que consume la sección (013 §4):

| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) que la web traduce |
|---|---|---|---|---|
| GET | `/api/v1/public-links?fileId` | CLIENT | → `200 { link: PublicLinkSummary \| null }` | `404` `STORAGE_NODE_NOT_FOUND` (CA-14); red/5xx (CA-13) |
| POST | `/api/v1/public-links` | CLIENT | `{ fileId, expiresInDays, password? }` → `201 { link, url }` | `422` `SHARING_INVALID_REQUEST` (`INVALID_PASSWORD`, `INVALID_EXPIRY`; CA-5); `404` `STORAGE_NODE_NOT_FOUND`; `403` `STORAGE_ACCOUNT_READ_ONLY` (CA-10); `429` `SHARED_TOO_MANY_REQUESTS` (CA-12) |
| DELETE | `/api/v1/public-links/:linkId` | CLIENT | → `204` | `404` `SHARING_LINK_NOT_FOUND` (CA-14) |

«Mi actividad» lee `GET /audit/my-events` sin cambios: `trigger` ya viene en `AuditEventResponse`. Sin eventos ni
Socket.IO.

## 5. Seguridad y operación
- **Sin `actor` nuevo ni consultas nuevas:** la autorización es la de la 013 (`PermissionResolver` + RLS). La web oculta
  según `accessLevel` (012b) y la solo lectura; el servidor revalida.
- **Token:** la URL no va a `console`, a mensajes de error, al título, a la URL de la página ni al almacenamiento del
  navegador; las respuestas llegan con `no-store` (013). Una prueba de la sección espía `Storage.prototype.setItem` y
  `console` y verifica que no reciben la URL.
- **Contraseña:** `off`, `name` propio y las marcas de 1Password y LastPass: el gestor no ofrece la de la cuenta ni guardarla (R-3, SEC-1). Se
  borra del estado al generar.
- **Contraste (R-5, S-6):** solo tokens de `ui-guidelines.md`. El campo de la URL usa `text-foreground`. El borde
  `secondary-foreground` va solo donde hace falta para llegar a 3:1: los botones `outline` sobre un fondo tintado («Cancelar»
  en la confirmación de revocar y los botones sobre un aviso de advertencia), como la 013b (PD-189). «Revocar enlace» en
  reposo lleva el borde normal y el texto `destructive` (5,4:1), como el mockup aprobado (S-1 de la revisión).
- **Bitácoras y métricas:** ninguna en la web.

## 6. Estrategia de pruebas (por riesgo)
Cada tarea de lógica empieza por su prueba en rojo; ningún CA se prueba en tres capas. Sin integración ni aislamiento
nuevos (no hay backend): `pnpm test:int` y `pnpm test:isolation` no cambian.

| CA | Nivel | Archivo |
|---|---|---|
| CA-4 (`publicLinkBody` sin `password` vacía), rutas y parseo | unit web | `features/sharing/sharing-api.spec.ts` |
| CA-10, CA-12, CA-14 (`publicLinkMessageOf`: texto y acción por `code`) | unit web | `features/sharing/share-messages.spec.ts` |
| CA-1, CA-3, CA-7 a CA-9, CA-13 (lectura, `generated` solo en memoria y limpiado, relectura tras mutar, respuesta vieja descartada) | unit web | `features/sharing/hooks/use-public-link.spec.ts` |
| CA-3, CA-5, CA-12 (formulario: validación, error junto al campo, progreso, conserva lo elegido) | web | `features/sharing/components/public-link-form.spec.tsx` |
| CA-6 (copiar, «Enlace copiado», fallo y selección) | web | `features/sharing/components/generated-link-field.spec.tsx` |
| CA-1, CA-4, CA-7 a CA-10, CA-13, CA-14 (estados de la sección, confirmaciones, foco, solo lectura, `403` tardío, sin almacenamiento ni `console`) | web | `features/sharing/components/public-link-section.spec.tsx` |
| CA-2, CA-11 (carpeta sin sección ni petición; Escape cancela solo lo abierto; Escape, X y clic fuera no cierran en curso; Escape cierra con la URL a la vista) | web | `features/sharing/components/share-dialog.spec.tsx` (casos nuevos) |
| CA-15 (axe y anuncios) | web | `features/sharing/a11y.spec.tsx` sobre los estados de §6. Axe en jsdom no mide viewport ni contraste |
| CA-15 (360 px, contraste AA, «reducir movimiento») | humana | T-08 y capturas de T-01 |
| CA-16, CA-17 | unit web | `features/audit/activity-labels.spec.ts` |
| 013b CA-3 a CA-7 (descarga, «Preparando…», resultado) | unit web | `features/sharing/hooks/use-public-link-download.spec.ts`: las ~9 pruebas de descarga de `use-public-link-visit.spec.ts` se mudan aquí **con las mismas aserciones** (I-7) |
| CA-18 | web | `features/sharing/components/public-link-visit.spec.tsx` (`hashchange` con descarga en curso: sin «Preparando…», `openUrl` no recibe la URL vieja, la ficha nueva descarga) |

Las suites actuales de `sharing` (012b, 013b) y `audit` siguen en verde sin cambiar aserciones. La única excepción es la
mudanza de I-7, que mueve pruebas de archivo sin tocar lo que afirman.

## 7. Riesgos y coherencia con el diseño
- **R-1 Escape o la X pierden la URL:**
  - Con el formulario o una confirmación abiertos, Escape solo los cancela. Con una acción en curso, ni Escape, ni la X,
    ni un clic fuera cierran (§1, M-2).
  - Con la URL a la vista, Escape cierra (D-7): el aviso de CA-3 ya lo advierte.
  - Si el diálogo se cierra antes de la respuesta de generar (con la pestaña, por ejemplo), al reabrir se ve «Activo»
    sin URL y se remedia con «Generar otro enlace» (spec S-4).
- **R-2 Portapapeles:** `navigator.clipboard` exige contexto seguro y puede rechazar; el campo seleccionable es el plan B
  (CA-6). En local funciona: `localhost` cuenta como contexto seguro.
- **R-3 PD-200 toca la página de la 013b:** puede cambiar sin querer la descarga del visitante. Lo cuidan las pruebas
  mudadas con las mismas aserciones (I-7) y el caso nuevo de CA-18.
- **R-4 Diálogo largo a 360 px:** formulario, lista y sección van en el mismo modal, que ya tiene
  `max-h-dvh overflow-y-auto`. Se revisa en T-01 y T-08.
- **Desviaciones de los diagramas:** ninguna (solo web). Sin DF nuevo. DF-91 dice que «la UI para eso llega con la 013c»:
  se actualiza a «llegó con la 013c» en el PR (una línea).
- **Pendientes:** PD-200 se cierra en el PR (fila a «Cerrados»). Sin PD nuevo.
- **ADR:** ninguno (sin dependencias nuevas).
- **Documentos en el PR:** `ui-guidelines.md` §4 y §7 (T-01, `ui-designer`), README de `features/sharing` y de
  `features/audit` si describen sus archivos, y la fila 013c de `specs/README.md`.

**Preguntas para Adrián:**
- **P-A** [RESUELTA 2026-11-11, Adrián] ¿Autorizas a Fátima a cambiar `apps/web/src/features/audit/activity-labels.ts`
  y su `activity-labels.spec.ts` (de `audit`, tuyo) para 013 CA-18 (precedente: 013 P-4, 013b P-C)? → Sí.

## 8. Aprobación
- `architect`: no aplica. Sin puerto nuevo entre módulos, tecnología nueva ni cambio de arquitectura.
- Dueños de módulo: `features/audit` (de Adrián): de acuerdo (P-A, 2026-11-11).
- Adrián: Aprobado (2026-11-11), con la auditoría del PR #107 aplicada (M-2 clic fuera, M-3 `ReadOnlyBanner`); S-7 se
  mantiene el `key` por pedido; mockup de T-01 aprobado.
