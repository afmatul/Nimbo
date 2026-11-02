# Revisión 012b — Diálogo «Compartir», lista de accesos y «Compartidos conmigo» (web)

> Una página. Revisor: `reviewer`. Aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | 2026-11-02 |
| Rango revisado | `main...feat/012b-compartir-web` (12 commits, 70 archivos, +3840/−155; casi todo `apps/web`) |
| CI | No consultado. Resultados locales abajo. |
| Veredicto | ✅ Aprobar. Sin bloqueantes; 2 importantes y 3 sugerencias. |

## Verificación local
- `pnpm lint` (raíz) sale en rojo con 3167 errores, todos en `apps/api/dist-worker-optimizer/*.js`: artefacto de build ignorado por git (`git check-ignore`), fuera del diff. `eslint apps/web/src/features/sharing apps/web/src/features/storage` sale limpio.
- `pnpm typecheck` pasa en los 5 proyectos.
- `pnpm test`: web, `sharing` y `storage`, 54 suites y 658 pruebas en verde. En `api` pasan 3174 de 3175; falla `redact-deep.spec.ts › CA-15 (R-8)`, prueba de rendimiento por tiempo (282 µs frente a 150), de 004/logging, ajena a este diff y sensible a la carga de la máquina.
- `pnpm test:int`: **no confirmado**. Terminó por tiempo (exit 143, tope de 10 min) con todas las suites mostradas en PASS. La spec no toca la API; que lo confirme el CI.
- `pnpm test:isolation`: no se corrió; la spec no agrega consultas (§5).

## Verificación de criterios de aceptación
| CA | Prueba | Estado |
|---|---|---|
| CA-1 | `access-list.spec.tsx` (cargando, vacía, personas, heredada), `share-dialog.spec.tsx` | ✅ |
| CA-2 | `share-dialog.spec.tsx` (feliz: progreso, éxito y persona en la lista sin recargar) | ✅ |
| CA-3 | `share-messages.spec.ts`, `share-dialog.spec.tsx` (`RECIPIENT_NOT_FOUND`, 429, conserva lo escrito), `sharing-api.spec.ts` (correo solo en el cuerpo) | ✅ |
| CA-4 | `access-list.spec.tsx` (cambiar nivel; solo bajar a Lector en solo lectura) | ✅ |
| CA-5 | `access-list.spec.tsx` (confirmar quitar; heredado sin botón y con carpeta) | ✅ |
| CA-6 | `file-row-menu.spec.tsx`, `folder-row-menu.spec.tsx`, `file-detail-view.spec.tsx`, `my-files.spec.tsx` (propietario, Editor, Lector) | ✅ |
| CA-7 | `sharing/a11y.spec.tsx` (axe sobre estados de §6), `storage/a11y.spec.tsx` | ✅ (ver S-1) |
| CA-8 | `received-shares-view.spec.tsx` (cargando, vacía, lista), `app-layout.spec.tsx` | ✅ |
| CA-9 | `received-shares-view.spec.tsx` (enlaces a carpeta o ficha), `file-detail-view.spec.tsx` | ✅ |
| CA-10 | `received-shares-view.spec.tsx` (confirmar, progreso, éxito, solo lectura) | ✅ |
| CA-11 | `received-shares-view.spec.tsx` (error de carga; `SHARING_SHARE_NOT_FOUND` con «Actualizar lista») | ✅ (ver S-3) |

## Seguridad
- **Datos de cliente**: sí, solo los que la 012 ya protege; sin consultas nuevas. Aislamiento cubierto por 012 CA-21, CA-22, CA-23.
- **Correo de terceros**: se muestra solo en `access-row.tsx:65` (lista que solo pide el propietario, 012 CA-9); viaja únicamente en el cuerpo del POST (`sharing-api.spec.ts`); vive en el estado del formulario y se limpia al compartir. Sin `localStorage`, `sessionStorage` ni `console.*` en `sharing/` ni en `shared-file-detail.tsx`.
- **«Compartidos conmigo»**: `receivedShareSchema` solo trae `owner.displayName`; nunca se muestra correo.
- **Escrituras sin `OWNER`**: una sola regla, `storage/node-access.ts` (`isOwner` / `canEditDocx`); el servidor revalida (RN-1).
- **Registros**: sin logger en `apps/web/src/features/sharing`.
- **Hallazgos**: ninguno. `security-auditor` no se invocó (spec solo web, sin consultas nuevas).

## UI
- Sin colores a mano ni px arbitrarios; solo tokens. Se reutilizan `StateView`, `ReadOnlyBanner`, `Alert`, `RadioGroup`, `Input`, `Label`, `AppLayout`. Textos en español con tuteo.
- Estados de §6 cubiertos; el foco vuelve al ⋮ al cerrar (`use-return-focus.ts`). «Enlace público» no se muestra (S-2 de la spec).
- No verificado sin navegador: comparación visual con el mockup y 360/1440 px; se apoya en axe y en el recorrido T-09. El mockup de «Compartir» figura «Borrador» en §6: confirmar su aprobación antes de cerrar.

## Constitución
- Tamaños: `file-explorer.tsx` 343→402 líneas; `file-detail-view.tsx` 585→648. Ambos bajo 800.
- Parámetros: ninguna función supera 3.
- DRY/YAGNI: permisos centralizados; `Retry-After` en el catálogo común; sin abstracciones sin consumidor. El `AlertDialog` propio de «Quitar acceso» está justificado en las notas.

## Bloqueantes
Ninguno.

## Importantes y sugerencias
- **[I-1]** Funciones > 30 líneas (Art. VII), todas JSX o hooks: `OwnFileDetail` (45), `FileDetailContent` (35), `FileDetailView` (31) en `file-detail-view.tsx`; `OwnExplorer` (32); `MyFiles` (34); `ShareForm` (37); `useReceivedShares` (40). Extraer subcomponentes o hooks antes del cierre de la fase.
- **[I-2]** `file-detail-view.tsx` (648) mezcla ficha propia, indexación y compartida. Antes de que la 013 sume el enlace público, mover `OwnFileDetail` a su archivo.
- **[S-1]** Confirmar que `sharing/a11y.spec.tsx` cubre 360 y 1440 px, y nombrar el CA en cada `it`.
- **[S-2]** `received-file-type.ts` duplica el mapa de `file-kind.ts` de la API: es PD-164.
- **[S-3]** Caso de «Salir» con error de red o 429 (CA-11).

## DF y pendientes
- **DF**: ninguno declarado. Registrar en `design-findings.md` o en las decisiones del plan: la ficha compartida depende de un `404` de `/versions`, y «Fijar» se ocultó sin respaldo en una spec.
- **Pendientes**: PD-164 ya está en `docs/sdd/pendientes.md` (sumar `kind` a `receivedShareSchema` y borrar el mapa). P-2 abierta, no bloquea.
- **Documentación**: la cabecera de `plan.md` dice «Propuesto» y su §8 «Aprobado»; alinearla.
