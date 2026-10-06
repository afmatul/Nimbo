# Audit en la web

«Mi actividad» (spec 004 D-4, mockup `audit/mi-actividad`): lo que se hizo en la cuenta, por el cliente y por el
personal de Nimbo, con filtros por origen y fechas, «Cargar más» y sus estados. Solo `audit-api.ts` habla con la API.
La página no muestra nombres de archivo ni del actor: el evento no los trae (D-2, D-3).

| Pieza                               | Qué hace                                                                                                                             | Tarea      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `audit-api.ts`                      | `GET /audit/my-events` sobre `auth-fetch`; valida con `listAuditEventsResponseSchema`                                                | T-07       |
| `routes.ts`                         | `/actividad` (`ACTIVITY_PATH`) y su rótulo; los usa el menú de la cuenta                                                             | T-07, T-09 |
| `activity-labels.ts`                | Textos de cada evento: acción, actor y recurso                                                                                       | T-07       |
| `hooks/use-activity.ts`             | Filtros, primera página, «Cargar más», reintento; `load` debe ser estable                                                            | T-07       |
| `components/activity-view.tsx`      | Vista y estados (cargando, error con `correlationId`, vacío, vacío con filtros); `SessionActivityView` la conecta con `useAuthFetch` | T-08       |
| `components/activity-filters.tsx`   | Origen («Todo», «Yo», «Personal de Nimbo»), rango de fechas y «Limpiar filtros»                                                      | T-08       |
| `components/activity-event-row.tsx` | Fila de un evento                                                                                                                    | T-08       |
| `components/load-more-footer.tsx`   | «Cargar más» con cargando y error                                                                                                    | T-08       |
| `test-audit-event.ts`               | Constructor de eventos para las pruebas                                                                                              | T-07       |

## Textos (`activity-labels.ts`)

- Actor: «Tú» si el origen es `self`; con `staff`, el rol («Soporte de Nimbo», «Administración de Nimbo», «Operación
  de Nimbo») o «Personal de Nimbo» si el rol no tiene rótulo.
- Acción: en segunda persona si la hiciste tú («Subiste 1 archivo»), con el rol como sujeto si fue el personal
  («Soporte de Nimbo restauró 3 elementos»). Una acción que la web no conoce se lee «Actividad en tu cuenta».
- Recurso: tipo y cantidad («1 archivo», «1 carpeta», «1 carga», «N elementos») y el tamaño si lo trae («1 archivo,
  12 MB»); sin tipo ni cantidad, «Cuenta».

## Contrato

`ListAuditEventsQuery`, `ListAuditEventsResponse` y `AuditEventResponse` de `@nimbo/contracts`: 20 eventos del más
reciente al más antiguo; `nextCursor` es `null` al final (CA-9). Una respuesta fuera del contrato se trata como falla
del servidor (CA-14).
