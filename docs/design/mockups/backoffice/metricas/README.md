# Mockup: Administración · métricas agregadas

- **Spec**: 011 (CA-12, CA-14, CA-17; HU-4; RN-1; §6; P-1 opción A: panel propio en la app)
- **Propuesta presentada**: ninguna. La pantalla es nueva y sale de CA-12: solo totales y conteos (cuentas por estado y
  por plan, espacio total usado), nunca filas de una cuenta.
- **Ruta sugerida**: `/admin/metricas`. Ruta de navegación `Administración / Métricas`; «Métricas» marcado en la barra
  lateral. Para el Operador, la misma pantalla en su área (`Operación / Métricas`); la ruta la fija el plan.
- **Origen**: HTML autocontenido generado con `../../_generadores/metricas/generar.js`; no se edita a mano. El marco del
  área (barra lateral, barra superior, cajón, aviso, distintivos y estados de pantalla) sale de
  `_generadores/admin/area.js`, el mismo de las cinco pantallas de `backoffice/`. Tonos AA de
  `ui-guidelines.md` §2–§3, solo Inter, cifras con `tabular-nums`, versión móvil real a 360 px. Gráficos en HTML y CSS,
  sin librerías. Es referencia visual; `apps/web` no lo importa.
- **Enlaces entre mockups** (rutas relativas): en el área de administración, la barra lateral, el cajón, el logo y las migas llevan a Cuentas
  (`../admin/admin.html`), Catálogo de planes (`../catalogo/catalogo.html`) y Métricas (`../metricas/metricas.html`). En
  `metricas--operador.html`, la única entrada, el logo y la miga «Operación» llevan a `metricas--operador.html`.
- **Estados incluidos**:
  - default: dos totales y dos tablas con barras; ningún plan inactivo con cuentas (`metricas.html`)
  - cargando: esqueleto de los totales y las tablas, y «Cargando las métricas…» con `role="status"` (`metricas--cargando.html`)
  - error: «No pudimos cargar las métricas.» con «Reintentar» (`metricas--error.html`)
  - operador (CA-12, CA-17): la misma pantalla y los mismos datos que default, en solo lectura, en el área del
    Operador: persona «Pablo Xicará · Operador» (la cuenta de Operador de la lista de `backoffice/admin`), distintivo
    «OPERADOR» y una sola entrada, «Métricas»; sin Cuentas, Catálogo ni Soporte (`metricas--operador.html`)
  - con-plan-inactivo: Equipo desactivado aún con 52 cuentas, con su distintivo «Inactivo», y Equipo 2027 activo
    con 0 (`metricas--con-plan-inactivo.html`). Se agrega porque la marca de inactivo tiene que verse para aprobarse;
    es el mismo momento que `catalogo--desactivado`.
- **Capturas**: `docs/design/capturas/backoffice/metricas/` (`metricas--<estado>--<360|1440>.png`, con movimiento
  reducido). En los cinco estados: axe-core sin violaciones a 360 y 1440 px, sin desbordamiento horizontal a 360 px,
  sin errores de consola y sin objetivos menores de 24 px (`_generadores/pw/axe-seguridad.js` sobre la carpeta).

## Datos de ejemplo
Cuadran con los mockups de backoffice del área:

| Dato | Valor | Cuadra con |
|---|---|---|
| Cuentas en total | 1 284 = 1 272 de clientes + 12 internas | «Cuentas 1 284» de la navegación (`backoffice/admin`) |
| Por plan | Personal 1 012 · Pro 186 · Equipo 52 · Institucional 22 = 1 272 | Conteos de las tarjetas de `backoffice/catalogo` |
| Por estado | 1 275 activas + 9 suspendidas = 1 284 | La lista de `backoffice/admin` tiene una suspendida en la primera página |
| Espacio total usado | 39.4 TB | Suma verosímil de `usuario.espacio_usado` con los promedios de cada plan |
| con-plan-inactivo | Equipo (inactivo) 52 · Equipo 2027 0 | `catalogo--desactivado` |

En la app todo viene de la API: conteos agrupados (`count` por `estado` y por plan) y la suma de
`usuario.espacio_usado` en bytes (`bigint`), que la web formatea en GB o TB (potencias de 1024). Los porcentajes, con un
decimal, los calcula la web sobre el total de cada tabla. Planes y conteos salen de `_generadores/admin/corpus.js`, la
misma fuente del catálogo y de la navegación: los totales se calculan desde ahí y no pueden desviarse.

## Decisiones de UX
1. **Dos totales arriba** («Cuentas en total» y «Espacio total usado») como lista de definiciones: etiqueta con ícono,
   cifra grande y una línea que explica de qué es el número («1 272 de clientes y 12 internas»; «Lo que ocupan los
   archivos de las 1 272 cuentas de clientes»).
2. **El gráfico es la tabla**: «Cuentas por estado» y «Cuentas por plan» son `<table>` con encabezados, `caption` para
   lectores y pie de total. Cada fila dice nombre, número y porcentaje en texto; la barra bajo el nombre es decorativa
   (`aria-hidden`) y repite el porcentaje. Así el dato nunca depende del color ni de la forma (Art. XIII.4) y no hace
   falta una alternativa textual aparte. Barras horizontales con base común en cero, sin pastel ni dona: se leen bien
   con valores tan desiguales (99.3 % frente a 0.7 %) y caben a 360 px.
3. **Un solo tono para las barras** (`primary` sobre pista `muted`): la categoría ya la dice la etiqueta. El estado
   lleva el mismo `StatusBadge` que la lista de cuentas («Activas» con círculo de verificación, «Suspendidas» con
   prohibido).
4. **Estado sobre todas las cuentas, plan solo sobre clientes**: las internas no tienen plan. La nota «Las 12 cuentas
   internas no tienen plan; con ellas suman las 1 284 cuentas.» hace que las dos tablas cuadren con el total.
5. **Sin cuentas internas por rol** (YAGNI): CA-12 no lo pide y con 12 cuentas la lista de cuentas ya lo responde.
6. **Planes**: siempre todos los activos (aunque tengan 0 cuentas) en el orden del catálogo (por precio) y, al final,
   los inactivos que aún tienen cuentas, con el mismo distintivo «Inactivo» del catálogo (círculo de pausa y contorno
   neutro, nunca rojo) y barra neutra. Un plan inactivo sin cuentas no aparece.
7. **Aviso de privacidad propio** bajo el título, con candado: «Son datos agregados: solo totales y conteos, sin
   información de ninguna cuenta ni de sus archivos.» (RN-1). Sin enlaces a cuentas desde las cifras.
8. **Sin hora de los datos ni botón «Actualizar»**: son conteos al momento de abrir la pantalla (no hay caché ni
   proceso por lotes que los retrase); recargar la página los recalcula. Si el plan decide cachearlos, se agrega
   «Actualizado a las …».
9. **Sin rango de fechas ni series temporales** (CA-12 no los pide) y **sin métricas técnicas** (colas, latencias,
   errores, Grafana), que son de 022/022b.
10. **Cargando**: esqueleto con la misma forma (dos totales y dos tablas) y «Cargando las métricas…» con
    `role="status"`; la animación se detiene con movimiento reducido. **Error**: `ErrorState` con «Reintentar».
11. **A 360 px**: totales y tablas en una columna; las tablas conservan sus tres columnas (nombre con barra, cuentas y
    porcentaje) sin desplazamiento horizontal; el menú pasa al cajón del marco.
12. **Vista del Operador** (`operador`): la matriz §2 le da «Ver métricas agregadas» y nada más del área; ve la misma
    pantalla, sin acciones (no hay ninguna que dar) y en su propio marco («Operación», distintivo «OPERADOR», persona
    con ícono de servidor y una sola entrada), para que la navegación no sugiera Cuentas, Catálogo ni Soporte, que el
    servidor le niega (CA-14). Sus métricas técnicas llegan con 022b.

## Pendiente
- **Métricas técnicas del Operador** (colas, trabajos, bitácoras técnicas, RF-37): llegan con 022b, en su propia
  pantalla (`backoffice/operacion`). Hasta entonces el área del Operador solo tiene «Métricas» (estas, agregadas), como
  dicen la matriz de `product-context.md` §2 y CA-17.
- **Vacío**: no tiene estado propio. Siempre hay al menos un Administrador activo (RN-7); sin clientes, la tabla por
  plan muestra los planes activos con 0 y el espacio «0 B».
- **«Sin permiso»** (Soporte abre `/admin/metricas`, CA-14): pantalla común del marco, como en `backoffice/admin`.
- **Espacio usado**: si incluye la papelera y las versiones lo decide el cálculo de `usuario.espacio_usado` (005–007);
  el texto de la pantalla no lo afirma.
