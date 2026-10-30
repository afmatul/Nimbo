# Tareas 012 — Compartición y accesos (API)

> Spec: `./spec.md` · Plan: `./plan.md` (Propuesto: `/implement` exige «Aprobado»)
> 11 tareas verticales, de medio día a un día, un commit cada una (`feat(sharing): … [012 T-xx]`). Rama `feat/012-comparticion-y-accesos`, un PR.
> Cada tarea es una línea: criterio, prueba y de qué depende. Los archivos viven en `plan.md` §2. La prueba va primero (roja).

- [ ] **T-01** Contratos `sharing.ts` y migración A (`comparticion`, `nodos_compartidos()`, RLS propia, con `down`) — CA: CA-2 (forma), CA-21 (base) — Prueba: `migrations.int-spec.ts` `up → down → up` con dueño `NOSUPERUSER` y unitaria de los esquemas
- [ ] **T-02** `access`: `accessibleNodes` suma lo compartido, nace `ownedNodes`, y migración B (políticas `SELECT` del destinatario) — CA: CA-13, CA-17, CA-21 — Prueba: integración SQL real `accessible-nodes-shared.int-spec.ts` (directo, heredado, nivel mayor, papelera, suspensión, `EXPLAIN`) — Depende: T-01
- [ ] **T-03** `storage`: escrituras y destinos a `ownedNodes`, `findOwnedFolder` y export de `WritableAccountPolicy`, sin cambiar lo del propietario — CA: CA-14 — Prueba: iso que recorre las rutas de escritura de `storage` como Lector y Editor (roja primero) y las suites actuales de `storage` en verde — Depende: T-02
- [ ] **T-04** `storage`: el destinatario abre ficha, descarga, contenido y migas de lo compartido; la raíz sigue siendo solo suya — CA: CA-12, CA-13 — Prueba: integración `shared-access.int-spec.ts` (feliz y 404 de lo no compartido, sin cuota ni espacio ajeno) — Depende: T-03
- [ ] **T-05** Dominio `UserShare` y `AccessList`, errores `SHARING_*`, puerto `IShareeDirectory` y su adaptador en `identity` con el enlace de la raíz — CA: CA-2, CA-3, CA-5 — Prueba: unitarias `user-share.spec.ts` y del adaptador (solo clientes verificados y activos) — Depende: T-01
- [ ] **T-06** `POST /shares` (`SharingService.share`, repositorio, límite de intentos, solo lectura, `share.granted`/`share.level_changed` en la misma transacción) — CA: CA-1, CA-3 a CA-7, CA-19, CA-20 — Prueba: unitaria `sharing.service.spec.ts` e integración feliz y error principal en `shares.int-spec.ts` — Depende: T-02, T-05
- [ ] **T-07** `GET /shares` con accesos directos e heredados y su origen — CA: CA-8, CA-9 — Prueba: integración (feliz con carpeta heredada y `404`/`403` por nivel y rol) — Depende: T-06
- [ ] **T-08** `DELETE /shares/:shareId` con `share.revoked` y la cascada de la purga definitiva — CA: CA-10, CA-11, CA-18 — Prueba: integración (el destinatario recibe `404` en la siguiente petición; papelera conserva, purga borra) — Depende: T-06
- [ ] **T-09** Efectos del Editor y del agente: políticas RLS de `sesion_edicion`/`participacion` para el Editor y el agente que cita lo compartido — CA: CA-15, CA-16 — Prueba: integración `shared-editing.int-spec.ts` y casos nuevos en `agent.iso-spec.ts` — Depende: T-04, T-08
- [ ] **T-10** Aislamiento: A/B/C, RLS sin filtro, internos sin filas, `nodos_compartidos()` sin otra cuenta e igualdad de respuestas de CA-3 — CA: CA-3, CA-14, CA-17, CA-20, CA-21 — Prueba: aislamiento `sharing.iso-spec.ts` — Depende: T-08
- [ ] **T-11** **(humana)** Recorrido de la demo en local por API (y por la pantalla cuando exista la 012b): A comparte una carpeta con B como Editor, B la abre, A ve el acceso, lo revoca y B recibe `404`; nota en el PR — CA: los visibles — Depende: T-09, T-10

## Notas del developer
<Desviaciones (con enlace al registro de cambios de la spec), DF o pendientes que surgieron.>
