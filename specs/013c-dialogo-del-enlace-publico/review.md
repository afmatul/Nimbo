# Revisión 013c — Diálogo del enlace público (web)

| Campo | Valor |
|---|---|
| Fecha | 2026-11-11 |
| Rango revisado | `1b1eb49d...fc12e9d0` (T-02 a T-07: 47b6b7a0, db2c4e0b, 109625fa, fd0ed7c8, 32ded278, fc12e9d0) y las pruebas de seguridad sin commit |
| CI | Local en `apps/web` (Node 22): `tsc` ✅ · `eslint` ✅ · `jest` 249/249 suites, 2422/2422 ✅ (más 3 pruebas de seguridad, 40/40 en sus archivos). Sin cambios en `apps/api`: `test:int` e isolation no aplican |
| Veredicto | ✅ Aprobar (sin bloqueantes; I-1 a I-3 en este PR, I-4 como pendiente) |

## Verificación
| CA | Prueba (`apps/web/src/features/…`) | Estado |
|---|---|---|
| CA-1 | `sharing/components/public-link-section.spec.tsx` › CA-1 (de «Cargando…» a «sin enlace»); `hooks/use-public-link.spec.ts` › CA-1 | ✅ |
| CA-2 | `components/share-dialog.spec.tsx` › CA-2 (carpeta sin sección ni petición; sección después de «Personas con acceso») | ✅ |
| CA-3 | `public-link-form.spec.tsx` › CA-3 (opciones, `off` y marcas de los gestores, «Generando…» a los 2 s); `public-link-section.spec.tsx` › CA-3; `generated-link-field.spec.tsx` › CA-3 | ✅ |
| CA-4 | `sharing-api.spec.ts` › CA-4 (`publicLinkBody`, POST sin `password`); `public-link-section.spec.tsx` › CA-4 de punta a punta | ✅ |
| CA-5 | `public-link-form.spec.tsx` › CA-5 (< 8, > 128 y `422` de la API, junto al campo) | ✅ |
| CA-6 | `generated-link-field.spec.tsx` › CA-6 (copiar y su anuncio; si falla, el texto queda seleccionado; reintento) | ✅ |
| CA-7 | `public-link-section.spec.tsx` › CA-7 (activo y vencido); `use-public-link.spec.ts` › CA-7 | ✅ |
| CA-8 | `public-link-section.spec.tsx` › CA-8 (confirmación en línea con foco, cancelar, URL nueva, vencido sin advertencia) | ✅ (texto, I-3) |
| CA-9 | `public-link-section.spec.tsx` › CA-9 (foco en «Cancelar», éxito con foco en «Crear», «Revocando…») | ✅ (I-1) |
| CA-10 | `public-link-section.spec.tsx` › CA-10 (sin enlace, con enlace y `403` tardío); `public-link-form.spec.tsx` › CA-10 | ✅ |
| CA-11 | `share-dialog.spec.tsx` › CA-11: Escape cancela el formulario o la confirmación; con algo en curso no cierran ni Escape, ni la X, ni el clic fuera; sin nada en curso el clic fuera cierra como la X; D-7 | ✅ |
| CA-12 | `public-link-form.spec.tsx` › CA-12 (aviso de advertencia; conserva lo elegido); `share-messages.spec.ts` › CA-12 | ✅ |
| CA-13 | `public-link-section.spec.tsx` › CA-13 (al cargar y al revocar); `public-link-form.spec.tsx` › CA-13 | ✅ |
| CA-14 | `public-link-section.spec.tsx` › CA-14 (archivo: sin botón; enlace: «Actualizar» relee); `share-messages.spec.ts` › CA-14 | ✅ |
| CA-15 | `sharing/a11y.spec.tsx` › CA-15 (21 estados) y foco en las pruebas de la sección; 360 px, contraste AA y movimiento reducido van en T-08 (humana) | ✅ (S-2) |
| CA-16 | `audit/activity-labels.spec.ts` › CA-16 (`downloaded` y `locked` con «Alguien con el enlace») | ✅ |
| CA-17 | `audit/activity-labels.spec.ts` › CA-17 (`created` y `revoked` en segunda persona) | ✅ |
| CA-18 | `sharing/components/public-link-visit.spec.tsx` › CA-18; `hooks/use-public-link-download.spec.ts` (11 pruebas mudadas, mismas aserciones) | ✅ (S-3) |

## Seguridad
Veredicto: ✅ Sin hallazgos bloqueantes (`security-auditor`)

- **Datos de cliente.** Sí, pero solo a través de la API de la 013. El rango cambia `apps/web`, `docs/` y `specs/`; no hay rutas, consultas, contratos ni dependencias nuevas. El aislamiento ya lo cubre `apps/api/test/isolation/public-links.iso-spec.ts`: ISO-8 a ISO-14 para propietario ajeno, Lectora/Editora, roles internos y visitante con sesión ajena, e ISO-15 a ISO-29 para la RLS de `enlace_publico`. `actor` + `accessibleNodes`/RLS: ✅ sin cambios.
- **Pruebas agregadas.**
  - Web: `share-dialog.spec.tsx` › RN-1. La URL no va al título, a la URL de la app ni al historial, y al reabrir ya no se ve.
  - Web: `public-link-section.spec.tsx` › §5, dos casos. La contraseña se descarta al cancelar y no queda en la página después de generar.
  - ISO: ninguna, no aplica.
- **Bitácoras sin contenido, nombres, tokens ni contraseñas:** ✅. El código nuevo no usa `console`, `Storage`, IndexedDB, `document.title`, `history` ni analítica. Lo comprueban los espías de `Storage.prototype.setItem` y `console` en `use-public-link.spec.ts`, `public-link-section.spec.tsx`, `public-link-form.spec.tsx` y `generated-link-field.spec.tsx`.
- **Hallazgos.**
  - **[SEC-1]** baja · `apps/web/src/features/sharing/components/public-link-form.tsx:158-162`. `new-password` y `name` propio evitan que el navegador rellene la contraseña de la cuenta, pero no que el gestor de contraseñas ofrezca guardar la del enlace como credencial de Nimbo. Corrección: comprobarlo a mano en T-08 (Chrome, Edge y Firefox). Si aparece la oferta de guardar, agregar `data-1p-ignore` y `data-lpignore="true"` o evaluar `autoComplete="off"`. Si no se corrige, dejarlo en `pendientes.md`. **T-08 (12/11):** Chrome sí lo ofrecía; se aplicaron `off` y las dos marcas, y Chrome lo sigue ofreciendo: queda en **PD-208**.
  - **[SEC-2]** baja · `apps/web/src/features/sharing/hooks/use-public-link.ts:178` y `components/share-dialog.tsx:121`. `generated` y `reading` no se reinician si cambia `fileId` con el diálogo montado. Hoy no se puede provocar, porque el diálogo es modal y se cierra antes de abrir otro, y la URL sería del mismo propietario. Corrección defensiva: `<ShareDialogBody key={target.nodeId} …/>`.
- **Lista de comprobación.**
  - [x] La URL y el token solo viven en memoria del diálogo.
  - [x] La contraseña usa `off` (SEC-1, T-08), nunca se envía vacía y no va en la URL.
  - [x] El cliente del propietario (su sesión) y el del visitante (`credentials: 'omit'`) están separados.
  - [x] Solo el OWNER ve la sección, y una carpeta no hace ninguna petición.
  - [x] Los `404` y `403` no filtran información.
  - [x] PD-200: la URL de un pedido viejo nunca se abre.
  - [x] El visitante nunca aparece como «Tú» y no se muestran sus datos.
  - [x] Sin XSS: la URL se valida con `z.string().url()` y se muestra como `value` de un `Input` de solo lectura.
  - [x] El portapapeles solo se usa al hacer clic.
  - [x] Sin dependencias nuevas.

## UI
- Lo que coincide con el mockup aprobado `docs/design/mockups/sharing/compartir/`:
  - Orden de la sección (D-3) y «Crear» como `outline`.
  - Confirmaciones en línea (D-1) y el foco de cada estado (CA-15).
  - `ReadOnlyBanner` (M-3) y el `429` en advertencia.
  - La URL en `text-foreground` sobre `bg-muted`, y a 360 px los botones a todo el ancho.
  - «Cancelar» sobre el tono destructivo lleva el borde `secondary-foreground` (PD-189).
  - Solo tokens y `motion-reduce:animate-none`.
  - axe sin violaciones `serious` ni `critical` en jsdom. El contraste real a 360 y 1440 px queda para T-08.
- Desviaciones:
  - El texto del aviso al reemplazar (I-3).
  - El borde de «Revocar enlace» en reposo sigue el mockup y no el plan §5 (S-1).

## Bloqueantes
- Ninguno.

## Importantes y sugerencias
- **[I-1]** `apps/web/src/features/sharing/hooks/use-public-link.ts:79`. Después de revocar, la sección sigue mostrando «Activo», la nota y «Revocar enlace» junto a «Revocamos el enlace…» hasta que llega la nueva lectura, y pulsar otra vez da `404`. Contradice CA-9. Corrección: después del `204`, fijar `{ status: 'ready', link: null }` antes de releer, con una prueba en la que la relectura quede colgada.
- **[I-2]** `use-public-link.ts:27,67,88`. `clearGenerated` no tiene quien lo use: con la URL a la vista no se ofrece «Generar otro enlace» (mockup). Es código muerto (Art. V.3 y VII.6). Corrección: quitarlo junto con su prueba y ajustar S-5 en el plan §1 y §2.
- **[I-3]** `apps/web/src/features/sharing/components/public-link-section.tsx:56-57`. El texto «Generamos otro enlace y el anterior dejó de funcionar…» no está en la spec ni en el mockup. Corrección: escribirlo en CA-8, en el registro de cambios y en el README del mockup, o volver al texto de CA-3.
- **[I-4]** `public-link-form.tsx:125` y `public-link-section.tsx:63`. Hay dos terceras copias (Art. VI.2):
  - el error de campo con ícono, que ya existe en `backoffice/components/field-message.tsx` y en `public-link-password-form.tsx`;
  - el título «Tu cuenta está en solo lectura.», que ya existe en `read-only-notice.tsx` y `received-shares-view.tsx`.

  Toca módulos de otros dueños y el límite de 12 archivos, así que se registra como pendiente: `FieldMessage` en `components/nimbo/` y un título por omisión en `ReadOnlyBanner`.
- **[S-1]** `public-link-section.tsx:245`. El borde de «Revocar enlace» sigue el mockup aprobado (texto `destructive`, 5,4:1). Actualizar el plan §5.
- **[S-2]** `apps/web/src/features/sharing/a11y.spec.tsx`. En `enlace-no-existe`, correr axe antes de pulsar «Actualizar». Agregar `enlace-copiado`, `enlace-copia-fallida` y `enlace-reemplazando`.
- **[S-3]** `apps/web/src/features/sharing/hooks/use-public-link-download.ts:84-86`. El `key` por pedido es una defensa: la ficha ya se desmonta al pasar a `loading`, y por eso CA-18 pasa sin él. Se mantiene por decisión de Adrián (S-7). El comentario debe decirlo así.
- **[S-4]** `apps/web/src/features/sharing/components/share-dialog.spec.tsx:53`. La consulta de la prueba de la 012b cambió porque ahora hay una segunda región `role=status`; la aserción es la misma. Declararlo en el PR. Además, el plan R-4 dice «una sola región», pero en realidad hay una por mensaje: corregir el plan.

## Lo que está bien hecho
- `publicLinkBody` es la única regla para la contraseña vacía, y `publicLinkMessageOf` envuelve el catálogo sin duplicarlo.
- CA-11 se resuelve en `DialogContent` con `busy` y `cancelRef`, igual que `ConfirmDestructiveDialog`.
- PD-200 queda cerrado con número de pedido y un hook de descarga propio; las 11 pruebas se mudaron con las mismas aserciones.
- Funciones de ≤ 30 líneas y ≤ 3 parámetros, sin `any` y sin dependencias nuevas.

## DF y pendientes
- DF-91 actualizado («llegó con la 013c»). Sin DF nuevo.
- PD-200 cerrado. PD-207 por I-4 (era PD-206, que la 017 ya usa en `main`) y PD-208 por SEC-1. PD-209: la T-08 halló que un nombre sin espacios desplazaba «Compartir» a 360 px; se arregló en `share-dialog.tsx` y la base de los diálogos queda para Adrián.
- **T-08 (humana) hecha (Fátima, 12/11):** pasos 1–12 ✅; SEC-1 → `off` y marcas, Chrome la sigue ofreciendo (PD-208); 360 px corregido (PD-209) y confirmado; solo lectura (paso 14) no se recorrió: lo cubren las pruebas de CA-10.
- La spec pasa a `Hecha` cuando se integre.
