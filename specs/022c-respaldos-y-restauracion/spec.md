# Spec 022c — Respaldos y restauración

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | Abel |
| Fase | 3 |
| Requisitos | RNF-21 (con RNF-16 para los datos de las pruebas) |
| Depende de | 000 (compose, volúmenes, `minio-init`, `migration:run`, `/api/v1/health/ready`) |
| Última actualización | 2026-11-02 |

## 1. Contexto y objetivo
El 2026-11-02 Adrián partió la spec 022 en el PR #78: la 022 se queda con RNF-18, la 022c cubre RNF-21 y la vuelta
atrás (RNF-20) pasa a 000. Hoy la base de datos vive en un solo volumen sin respaldo, y el bucket tiene versionado
(000 D-7), pero sin límite ni procedimiento para recuperar versiones. Esta spec deja tres cosas: un respaldo diario
cifrado de la base, versiones no vigentes de los objetos que se conservan 7 días, y un procedimiento de restauración
documentado y ensayado con datos sintéticos, con su registro de prueba.
Los **respaldos de PostgreSQL** (copias de la base) y las **versiones de MinIO** (historial de cada objeto dentro
del mismo bucket) son mecanismos distintos y se verifican por separado.

## 2. Historias de usuario
- **HU-1** Como Operador, quiero un respaldo diario y cifrado de la base de datos, para restaurarla con un procedimiento probado.
- **HU-2** Como Operador, quiero que los objetos conserven sus versiones anteriores durante un tiempo, para recuperar un objeto sobrescrito o borrado por error fuera de Nimbo.

## 3. Criterios de aceptación
Equivalencias con la spec 022 anterior a la partición:

| 022 (original) | 022c | Nota |
|---|---|---|
| HU-4 | HU-1 (base de datos) y HU-2 (objetos) | Se separan los dos mecanismos |
| CA-19 | CA-1 | Igual; «ambiente de P-2» = local (P-2) |
| CA-20 | CA-2 | Igual; se precisa qué no aparece en la bitácora |
| CA-21 | CA-5 | Igual; se agrega que el aislamiento sigue activo |
| CA-22 | CA-8 | Igual |
| RN-5 | RN-1 | Sin la vuelta atrás por fase (RNF-20 → 000) |
| — | CA-3, CA-4, CA-6, CA-7, CA-9; RN-2 a RN-6 | Nuevos: decisión P-5 de Adrián y casos de error |

- **CA-1** (HU-1, RNF-21) Dado un día de operación en local con el servicio de respaldos encendido, cuando llega la hora programada, entonces existe un respaldo de la base de ese día en el volumen de respaldos y la bitácora técnica registra el éxito con su tamaño y duración.
- **CA-2** (HU-1, RNF-21) — error: Dado un intento de respaldo, cuando falla (base inalcanzable, credencial rechazada, clave de cifrado ausente o error al cifrar o escribir), entonces no queda ningún archivo parcial, las copias anteriores quedan intactas (mismos archivos y bytes) y la bitácora registra el fallo con su `code`, sin cadenas de conexión, credenciales, claves ni el texto del error de la herramienta.
- **CA-3** (HU-1, RNF-21) Dado que ya hay 7 respaldos correctos, cuando otro termina bien, entonces quedan exactamente los 7 más recientes, en un volumen distinto del de la base de datos.
- **CA-4** (HU-1, RNF-21) — error: Dado un respaldo, cuando se intenta leer o restaurar sin la clave del Operador o con otra, entonces no se obtiene nada legible, la restauración se detiene con `RESTORE_KEY_INVALID` y la base destino no cambia.
- **CA-5** (HU-1, RNF-21, RNF-16) Dado el respaldo más reciente de un ambiente con datos sintéticos, cuando el Operador sigue el procedimiento documentado sobre una base vacía, entonces la base queda restaurada, `migration:run` no tiene pendientes, `/api/v1/health/ready` responde `200`, las tablas con aislamiento conservan su RLS y los conteos de control coinciden (filas de un conjunto fijo de tablas y objetos del corpus referenciados por la base, contados antes de respaldar y después de restaurar); el registro de la prueba (fecha, respaldo, duración, resultado) queda en la documentación de operación del repositorio.
- **CA-6** (HU-1, RNF-21) — error: Dado una base destino que ya tiene tablas, cuando el Operador intenta restaurar sobre ella, entonces el procedimiento se detiene con `RESTORE_TARGET_NOT_EMPTY` antes de escribir y la base no cambia.
- **CA-7** (HU-2, RNF-21) Dado el bucket de Nimbo después de inicializar MinIO, entonces tiene el versionado activo y una sola regla de ciclo de vida que expira las versiones no vigentes a los 7 días; repetir la inicialización no duplica ni cambia esa regla.
- **CA-8** (HU-2, RNF-21, RNF-16) Dado, en un ambiente con datos sintéticos, un objeto sobrescrito o borrado fuera de los flujos de Nimbo, cuando el Operador sigue el procedimiento, entonces recupera su versión anterior del almacén versionado y Nimbo vuelve a entregar los mismos bytes que antes. Lo que Nimbo purga a propósito (papelera, poda de versiones) borra todas las versiones del objeto y no se recupera.
- **CA-9** (HU-1, HU-2, RNF-21) Dado un Cliente, Administrador o Soporte, entonces Nimbo no ofrece ninguna pantalla, ruta de la API ni puerto publicado para respaldos, restauración o versiones de objetos: solo el Operador, con acceso al servidor, los administra.

## 4. Reglas de negocio
- **RN-1** Respaldo de la base de datos diario (RNF-21). La restauración se prueba al menos una vez por fase (`workflow.md` §6) con datos sintéticos (RNF-16). Se demuestra en **local** con el compose; se repite en staging cuando exista, sin bloquear el cierre de 022c (P-2).
- **RN-2** Una copia por día; se conservan las **7 copias más recientes** (no 7 por día), en un volumen distinto del de la base (P-5).
- **RN-3** Las copias se guardan **cifradas**; la herramienta la fija ADR-0041 y la clave la custodia el Operador **fuera del repositorio**. La clave nunca está en el repositorio, en `.env.example` ni en bitácoras (P-5).
- **RN-4** Un respaldo fallido **no borra** copias anteriores, no cuenta entre las 7 y queda en la bitácora con su `code` (P-5).
- **RN-5** Las versiones **no vigentes** de MinIO se conservan **7 días** con una sola regla de ciclo de vida. La versión vigente de un objeto nunca expira, así que el historial funcional de Nimbo (cada versión de un archivo es su propio objeto vigente, 014) no cambia. La purga deliberada de Nimbo (papelera 006, poda de versiones 014) sigue borrando todas las versiones (P-5).
- **RN-6** Antes de producción, las copias se llevan además a un destino externo al servidor; queda fuera de la demo local (§7) y se anota como pendiente.

## 5. Seguridad y privacidad
- ¿Toca datos de un cliente? Sí, en bloque: un respaldo contiene todos los datos de todas las cuentas. No agrega
  consultas por actor ni cambia `accessibleNodes`, así que no lleva prueba de aislamiento nueva. Lo que sí se prueba
  es que la base restaurada conserva su RLS y que la app vuelve a conectarse como `nimbo_app` (CA-5).
- Los respaldos de producción viven fuera del repositorio y solo los administra el Operador (matriz §2 de
  `product-context.md`: «Administrar respaldos, llaves, configuración», solo Operador). Las pruebas y el ensayo usan
  solo datos sintéticos que crean ellas mismas (RNF-16).
- Bitácoras: solo evento, `code`, tamaño, duración, nombre del archivo de respaldo (fecha y hora) y `correlationId`
  de la corrida (RNF-17). Nunca contenido, nombres de archivo de usuarios, correos, contraseñas, tokens, cadenas de
  conexión, credenciales ni claves de cifrado.
- Auditoría (RF-07): no aplica. El ensayo restaura datos sintéticos en local; ningún rol interno actúa sobre una
  cuenta ajena.
- Roles internos: Administrador y Soporte no administran respaldos (CA-9). Nimbo no tiene ruta ni pantalla para eso;
  el Operador los gestiona desde el servidor, sin ver contenido a través de Nimbo.

## 6. Experiencia de usuario
- Sin interfaz: el Operador trabaja con comandos de compose y con el procedimiento documentado. No necesita mockup.

## 7. Fuera de alcance
- Restaurar un respaldo sobre cuentas reales: sería una acción interna sobre cuentas ajenas (RF-07, Art. IX.4).
- La copia a un destino externo antes de producción (RN-6): destino y frecuencia se deciden aparte (PD-170).
- La alerta por respaldo fallido: no está entre las alertas de `product-context.md` §7 y queda en PD-167 (a).
- La vuelta atrás ensayada por fase (RNF-20): es de la 000.
- El ensayo en staging: se repite cuando exista staging y no bloquea el cierre (P-2, PD-173).
- Recuperación a un punto en el tiempo (archivado de WAL) y respaldos incrementales.
- Una copia de los objetos de MinIO fuera de su volumen: RNF-21 pide versionado de objetos, y el versionado no
  protege si se pierde el volumen (PD-171).
- Respaldar Redis (colas y caché), ONLYOFFICE, Traefik o Mailpit.
- Recuperar lo que Nimbo purga a propósito (RN-5).

## 8. Supuestos
- **S-1** La hora programada es configurable; el valor por defecto es 03:00 en la zona `America/Guatemala`.
- **S-2** Si el servicio está apagado a la hora programada, ese día no tiene respaldo y la ejecución no se recupera
  al arrancar. Se nota porque falta el éxito del día en la bitácora (la alerta es PD-167).
- **S-3** «Bitácora técnica» es la salida JSON del contenedor de respaldos (`docker compose logs`), con el mismo
  formato y redacción que las bitácoras de Nimbo y un `correlationId` por corrida.
- **S-4** El servicio de respaldos se enciende con un perfil de compose propio, como ONLYOFFICE, para que el
  `docker compose up -d` de desarrollo no exija la clave de cifrado.
- **S-5** «Base vacía» es un volumen de Postgres nuevo, inicializado por el compose con el rol `nimbo_app`.
- **S-6** El conjunto fijo de tablas de los conteos de control y el corpus sintético se definen en el plan. No
  dependen de `pnpm seed`, que sigue siendo un marcador (PD-135).

## 9. Preguntas
- [RESUELTA] ¿La 022 se parte? → Sí: 022 = RNF-18; 022c = RNF-21, dueño Abel, depende de 000, con rama y PR propios
  y en paralelo con la 022; RNF-20 va a 000 (2026-11-02, Adrián, PR #78).
- [RESUELTA] P-2 ¿En qué ambiente se demuestra RNF-21? → En local con el compose y un corpus sintético; se repite en
  staging cuando exista, sin bloquear el cierre (2026-11-02, Adrián).
- [RESUELTA] P-5 ¿Cómo se respalda? → `pg_dump` en formato *custom*, una vez al día, 7 copias en un volumen distinto
  del de Postgres, cifradas con la herramienta de ADR-0041 y clave del Operador fuera del repositorio. Antes de
  producción, copia a un destino externo. Versiones no vigentes de MinIO 7 días con una sola regla ILM
  (NoncurrentVersionExpiration), sin tocar la purga deliberada ni el historial. Ejecutor: un contenedor programado
  dentro del compose, no systemd (igual en Windows y Linux). Un fallo no borra las copias anteriores y queda con su
  `code` (2026-11-02, Adrián).
- [RESUELTA] ¿Alerta por respaldo fallido? → No entra: no está entre las seis alertas de §7; queda en PD-167 (a)
  (2026-11-02, Adrián).

## 10. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-11-02 | Creación (spec, plan y tareas en un pase, ADR-0034) desde HU-4, CA-19 a CA-22 y RN-5 de la 022 | Partición de la 022 (PR #78) | — |
