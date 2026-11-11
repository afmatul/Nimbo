# Plan 013c — Diálogo del enlace público (web)

> Spec: `./spec.md` · Estado del plan: Propuesto
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.
> D-1 a D-10 resueltas por Fátima (2026-11-10, spec §9).

## 1. Resumen técnico
- **Solo web, un PR** (`feat/013c-dialogo-del-enlace-publico`). Sin backend, migración ni contrato nuevo: las tres rutas
  del propietario y sus esquemas son de la 013 (`createPublicLinkSchema`, `currentPublicLinkSchema`,
  `createdPublicLinkSchema`, `PUBLIC_LINK_EXPIRY_OPTIONS`, `PUBLIC_LINK_DEFAULT_EXPIRY_DAYS`).
- **Cliente (DRY):** `SharingApi` (012b) suma tres métodos sobre el mismo `StorageHttp` con sesión
  (`useSessionSharingApi`). No se crea otro cliente: es la misma API de `sharing`, con el mismo `auth-fetch` y el mismo
  `StorageRequestError`. `createPublicLink` omite `password` si está vacía (CA-4) antes de validar con el contrato.
- **Estado:** un hook `usePublicLink(api, fileId)` con el patrón de `useAccessList` (`useState`/`useEffect`, una lectura
  por intento, respuesta vieja descartada). Expone la lectura (`loading` / `error` / `ready` con `PublicLinkSummary | null`),
  la URL recién generada (solo en memoria, RN-1) y las mutaciones `create` y `revoke`; tras cada una vuelve a leer.
- **Vista:** `PublicLinkSection` decide qué mostrar según la lectura, el modo local (`idle`, `form`, `confirm-replace`,
  `confirm-revoke`) y `useReadOnlyAccount` (D-6 (a), como `access-row`). El formulario (`PublicLinkForm`) y el campo de la
  URL con «Copiar» (`GeneratedLinkField`) son componentes propios para que cada archivo quede corto (Art. VII.2).
- **Validación en el navegador:** el formulario valida con `createPublicLinkSchema.safeParse` como `share-form.tsx`
  (`validate`): el `422` de longitud da el mismo texto que la API (`SHARING_FIELD_MESSAGES.INVALID_PASSWORD`, 013b
  CA-16, S-2) sin una regla duplicada.
- **Escape (CA-11, riesgo R-1 del `ui-designer`):** Radix escucha Escape en el documento, así que un manejador dentro de
  la sección no lo detiene. `ShareDialogBody` pasa a `DialogContent` un `onEscapeKeyDown` que pregunta a la sección si
  tiene algo abierto (formulario o confirmación); si lo cancela, evita el cierre (`preventDefault`). La sección registra
  esa función con una prop de callback (sin contexto nuevo).
- **Textos por `code` (Art. VI.3):** `share-messages.ts` suma `SHARING_LINK_NOT_FOUND` («Actualizar») y una acción
  `fix_password` («Corregir la contraseña»). El `404` del archivo y la solo lectura de la sección usan textos propios de
  la sección (D-8, CA-10): `STORAGE_NODE_NOT_FOUND` de 012b dice «Actualiza la lista», que aquí no aplica. El `429` y la
  red reutilizan `shareMessageOf` sin cambios (CA-12, CA-13).
- **«Mi actividad» (CA-16, CA-17):** `activity-labels.ts` suma un origen `public_link` junto a `scheduled`
  (`ActionText.publicLink`) y las cuatro acciones `public_link.*`. `activityActorLabel` devuelve «Alguien con el enlace»
  cuando `trigger === 'public_link'`. Sin cambios en `activity-event-row.tsx`.
- **PD-200 (CA-18):** el pedido del fragmento pasa de la identidad de `{ token }` a un número de pedido explícito
  (m-2 de Adrián en el #105). La descarga se ata al pedido: la parte de la ficha que descarga se monta con `key` = número
  de pedido, así cada pedido tiene su propio `usePreparingDownload` (sin «Preparando…» heredado y sin esperar a la
  anterior), y lo que llegue de un pedido viejo (URL, fallo) se descarta comparando su número con el vigente. `lib/` no
  cambia.

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| web/sharing (cliente) | `features/sharing/sharing-api.ts` (+ `test-sharing.ts`) | `currentPublicLink(fileId)` (`GET /public-links?fileId`), `createPublicLink(body)` (`POST /public-links`, sin `password` vacía) y `revokePublicLink(linkId)` (`DELETE /public-links/:linkId`), validados con `currentPublicLinkSchema` y `createdPublicLinkSchema`. El doble de pruebas suma un enlace de ejemplo y una URL ficticia |
| web/sharing (textos) | `features/sharing/share-messages.ts` | `SHARING_LINK_NOT_FOUND` → `refresh`; `ShareFix` suma `fix_password` con rótulo; `fieldMessageOf` da `fix_password` para `INVALID_PASSWORD` y `retry` para `INVALID_EXPIRY`. `ShareErrorAlert` toma el rótulo nuevo sin cambiar (su tipo de manejadores sale de `ShareFix`) |
| web/sharing (estado) | `features/sharing/hooks/use-public-link.ts` | `usePublicLink(api, fileId)`: lectura por intento, `generated` (`{ url, link }` o `null`, solo en memoria), `create(input)` y `revoke(linkId)` que rechazan con el error de la API y releen al salir bien; `reload` para «Reintentar» y «Actualizar» |
| web/sharing (sección) | `features/sharing/components/public-link-section.tsx` | `h3` «Enlace público» (D-3) y los estados de spec §6: cargando, error, sin enlace, activo/vencido (`expiresAtLabel` de `lib/format-date.ts`), confirmaciones en línea (D-1 (a)), solo lectura (D-6 (a)), avisos de éxito y errores con `ShareErrorAlert`. Una sola región `role="status"` para los anuncios (R-4); foco explícito al botón siguiente cuando el pulsado desaparece (R-2) |
| web/sharing (formulario) | `features/sharing/components/public-link-form.tsx` | `RadioGroup` «Vence en» con `PUBLIC_LINK_EXPIRY_OPTIONS` (D-4), `PasswordField` de `components/nimbo/` con `autoComplete="new-password"`, `name` propio y la ayuda de spec §5 (R-3), `maxLength` = `PUBLIC_LINK_PASSWORD_MAX_LENGTH`; validación con el contrato (§1), «Generando…» pasados 2 s con `usePendingConfirm` (como `share-form`), conserva lo elegido ante un error |
| web/sharing (URL) | `features/sharing/components/generated-link-field.tsx` | `Input` de una línea y solo lectura con la URL (R-6, texto `foreground`), «Copiar enlace» con `navigator.clipboard.writeText` y estado «Enlace copiado» hasta la siguiente interacción (D-9); si falla, el aviso de CA-6 y el texto seleccionado (R-7). Recibe la función de copiar por prop con `navigator.clipboard` por omisión, para probar el fallo |
| web/sharing (diálogo) | `features/sharing/components/share-dialog.tsx` | Monta `PublicLinkSection` solo si `target.nodeType === 'file'` (CA-2), después de `AccessList`; `onEscapeKeyDown` de §1 (CA-11). El comentario del componente deja de decir «sin la sección hasta la 013» |
| web/audit (de Adrián, P-A) | `features/audit/activity-labels.ts` | `PUBLIC_LINK_LABEL` = «Alguien con el enlace»; `ACTION_TEXTS` suma `public_link.created`, `public_link.revoked` (`self`), `public_link.downloaded` y `public_link.locked` (`publicLink`); `activityActionLabel` y `activityActorLabel` miran `trigger === 'public_link'` como hoy miran `scheduled` |
| web/sharing (visitante, PD-200) | `features/sharing/hooks/use-public-link-visit.ts`, `components/public-link-visit.tsx` | Número de pedido explícito en `VisitSnapshot` en vez de la identidad de `{ token }`; la descarga sale de `usePublicLinkVisit` a un hook propio (`usePublicLinkDownload`) que usa la ficha, montada con `key` = número de pedido; `openUrl` y el fallo se ignoran si su pedido ya no es el vigente |
| diseño (T-01, `ui-designer`) | `docs/design/mockups/sharing/compartir/` (`_generadores/compartir/generar.js`, `compartir--enlace-<estado>.html`, README), `docs/design/capturas/sharing/compartir/`, `ui-guidelines.md` §7 fila «Enlace público (diálogo…)» y §4 | Base del diálogo 012b que haga falta y las 24 variantes a 360 y 1440 px (48 PNG, D-10); README corregido («clave» → «contraseña», contraseña opcional); fila 303 con los estados y su estado de aprobación; en §4, la excepción de la confirmación en línea a `ConfirmDestructiveDialog` (D-1 (a)) |

10 filas. **Archivos de producción: 10** (`sharing-api.ts`, `share-messages.ts`, `use-public-link.ts`,
`public-link-section.tsx`, `public-link-form.tsx`, `generated-link-field.tsx`, `share-dialog.tsx`,
`activity-labels.ts`, `use-public-link-visit.ts`, `public-link-visit.tsx`). Aparte: `test-sharing.ts` (apoyo de
pruebas), las pruebas de §6 y los mockups y capturas de T-01. Una pantalla (la sección); «Mi actividad» solo cambia textos.

**Puertos y dependencias:**
- **Puertos nuevos:** ninguno. **Abstracciones nuevas:** ninguna; `usePublicLink` y `usePublicLinkDownload` son hooks de
  una sola implementación, como `useAccessList`.
- **Dependencias nuevas entre módulos web:** ninguna. `sharing → storage` (`StorageHttp`, `useReadOnlyAccount`,
  `usePendingConfirm`), `sharing → lib` y `sharing → components/nimbo` ya existen; `audit` no importa de `sharing`.

**Reutilizar antes de crear** (buscado con Grep):
- `createSharingApi`/`useSessionSharingApi`, `parseResponse`, `shareMessageOf` y `ShareErrorAlert`, `usePendingConfirm`,
  `useReadOnlyAccount`, `RadioGroup`, `Input`, `Alert`, `PasswordField`, `expiresAtLabel`, `RENEW_PATH` (por
  `ShareErrorAlert`), `useReturnFocus` del diálogo.
- No hay utilidad de portapapeles en `apps/web` (Grep `clipboard`: sin resultados): se usa la API del navegador
  directamente, sin dependencia nueva.

## 3. Datos
No aplica: sin tablas ni migraciones. La web no guarda nada en `localStorage` ni `sessionStorage`: la URL generada y la
contraseña viven solo en el estado del hook y del formulario, y se descartan al cerrar el diálogo (se desmonta, 012b).

## 4. Contratos
Sin rutas ni esquemas nuevos. Lo que consume la sección (013 §4):

| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) que la web traduce |
|---|---|---|---|---|
| GET | `/api/v1/public-links?fileId` | CLIENT | → `200 { link: PublicLinkSummary \| null }` | `404` `STORAGE_NODE_NOT_FOUND` (CA-14); red/5xx (CA-13) |
| POST | `/api/v1/public-links` | CLIENT | `{ fileId, expiresInDays, password? }` → `201 { link, url }` | `422` `SHARING_INVALID_REQUEST` (`INVALID_PASSWORD`, `INVALID_EXPIRY`; CA-5); `404` `STORAGE_NODE_NOT_FOUND`; `403` `STORAGE_ACCOUNT_READ_ONLY` (CA-10); `429` `SHARED_TOO_MANY_REQUESTS` (CA-12) |
| DELETE | `/api/v1/public-links/:linkId` | CLIENT | → `204` | `404` `SHARING_LINK_NOT_FOUND` (CA-14) |

«Mi actividad» lee `GET /audit/my-events` sin cambios (`trigger` ya viene en `AuditEventResponse`). Sin eventos ni Socket.IO.

## 5. Seguridad y operación
- **Sin `actor` nuevo ni consultas nuevas:** la autorización es la de la 013 (`PermissionResolver` + RLS). La web oculta
  según `accessLevel` (012b) y solo lectura; el servidor revalida.
- **Token:** la URL no va a `console`, a mensajes de error, al título, a la URL de la página ni al almacenamiento del
  navegador; las respuestas llegan con `no-store` (013). Una prueba de la sección espía `Storage.prototype.setItem` y
  `console` y verifica que no reciben la URL.
- **Contraseña:** `new-password` y `name` propio para que el gestor del navegador no ofrezca la de la cuenta (R-3); se
  borra del estado al generar.
- **Contraste (R-5):** solo tokens de `ui-guidelines.md`; el campo de la URL usa `text-foreground` y el borde de
  «Reintentar» sobre advertencia usa `secondary-foreground`, como la 013b (PD-189).
- **Bitácoras y métricas:** ninguna en la web.

## 6. Estrategia de pruebas (por riesgo)
Cada tarea de lógica empieza por su prueba en rojo; ningún CA se prueba en tres capas. Sin integración ni aislamiento
nuevos (no hay backend): `pnpm test:int` y `pnpm test:isolation` no cambian.

| CA | Nivel | Archivo |
|---|---|---|
| CA-4 (sin `password` vacía), rutas y parseo | unit web | `features/sharing/sharing-api.spec.ts` |
| CA-5, CA-10, CA-12, CA-14 (texto y acción por `code`) | unit web | `features/sharing/share-messages.spec.ts` |
| CA-1, CA-3, CA-7 a CA-9, CA-13, CA-14 (lectura, URL solo en memoria, relectura tras mutar, respuesta vieja descartada) | unit web | `features/sharing/hooks/use-public-link.spec.ts` |
| CA-3 a CA-11 (estados de la sección, confirmaciones, foco, Escape, solo lectura, copiar y su fallo, sin almacenamiento ni `console`) | web | `features/sharing/components/public-link-section.spec.tsx` |
| CA-2, CA-11 (carpeta sin sección ni petición; Escape no cierra con una confirmación abierta) | web | `features/sharing/components/share-dialog.spec.tsx` (casos nuevos) |
| CA-15 (axe y anuncios) | web | `features/sharing/a11y.spec.tsx` sobre los estados de §6. Axe en jsdom no mide viewport ni contraste |
| CA-15 (360 px, contraste AA, «reducir movimiento») | humana | T-07 y capturas de T-01 |
| CA-16, CA-17 | unit web | `features/audit/activity-labels.spec.ts` |
| CA-18 | unit web | `features/sharing/hooks/use-public-link-visit.spec.ts` (`hashchange` con descarga en curso: sin «Preparando…», `openUrl` no recibe la URL vieja, la ficha nueva descarga) |

Las suites actuales de `sharing` (012b, 013b) y `audit` siguen en verde sin cambiar aserciones, salvo las de
`use-public-link-visit.spec.ts` que dependan de la forma interna del pedido.

## 7. Riesgos y coherencia con el diseño
- **R-1 Escape cierra el diálogo y se pierde la URL:** mitigado con `onEscapeKeyDown` (§1) y su prueba. Cerrar con la URL
  sin copiar no pide confirmación (D-7): el aviso de CA-3 ya lo dice y «Generar otro enlace» lo remedia.
- **R-2 Portapapeles:** `navigator.clipboard` exige contexto seguro y puede rechazar; el campo seleccionable es el plan B
  (CA-6). En local (`http://localhost`) funciona: `localhost` cuenta como contexto seguro.
- **R-3 PD-200 toca la página de la 013b:** puede cambiar sin querer la descarga del visitante. Lo cuidan las suites de
  013b sin cambiar aserciones de comportamiento y el caso nuevo de CA-18.
- **R-4 Diálogo largo a 360 px:** formulario, lista y sección en el mismo modal; ya tiene `max-h-dvh overflow-y-auto`.
  Se revisa en T-01 y T-07.
- **Desviaciones de los diagramas:** ninguna (solo web). Sin DF nuevo. DF-91 dice que «la UI para eso llega con la 013c»:
  se actualiza a «llegó con la 013c» en el PR (una línea).
- **Pendientes:** PD-200 se cierra en el PR (fila a «Cerrados»). Sin PD nuevo.
- **ADR:** ninguno (sin dependencias nuevas).
- **Documentos en el PR:** `ui-guidelines.md` §4 y §7 (T-01), README de `features/sharing` y de `features/audit` si
  describen sus archivos, `specs/README.md` (fila 013c).

**Preguntas para Adrián:**
- **P-A** ¿Autorizas a Fátima a cambiar `apps/web/src/features/audit/activity-labels.ts` y su `activity-labels.spec.ts`
  (de `audit`, tuyo) para 013 CA-18 (precedente: 013 P-4, 013b P-C)? Si no, lo haces tú y T-05 espera ese commit —
  bloquea: no

## 8. Aprobación
- `architect`: no aplica. Sin puerto nuevo entre módulos, tecnología nueva ni cambio de arquitectura.
- Dueños de módulo: `features/audit` (de Adrián), según P-A.
- Adrián: <pendiente>
