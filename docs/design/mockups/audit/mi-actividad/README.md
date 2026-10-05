# Mockup: Mi actividad (auditoría para el cliente)

- **Spec**: 004 (RF-07; D-1 a D-4, D-6, D-8; CA-7 a CA-15)
- **Propuesta presentada**: No presentada (diseño interno). Usa el marco de la aplicación y los patrones de `identity/seguridad/` (encabezado sin migas, tarjetas, esqueleto, estado de error con `correlationId`, botones).
- **Origen**: HTML autocontenido generado con `../../_generadores/actividad/generar.js` (marco de `marco/marco.js`); no se edita a mano. Solo Inter, tokens de `ui-guidelines.md` §3, `tabular-nums` en fechas y cifras. Es referencia; `apps/web` no lo importa.
- **Estados** (`mi-actividad.html` es el default; los demás, `mi-actividad--<estado>.html`): default, cargando, vacio, vacio-filtros, error, filtrado, rango-invalido, cargando-mas, cargar-mas-error, fin-de-lista, menu-cuenta-abierto.
- **Capturas**: `docs/design/capturas/audit/mi-actividad/mi-actividad--<estado>--<360|1440>.png`. axe-core sin violaciones, sin desplazamiento horizontal a 360 px y objetivos de al menos 24 px en los 11 estados.

## Decisiones de UX
- Entrada «Mi actividad» en el menú de la cuenta, entre «Seguridad» y «Plan y facturación» (`marco.topbar({ actividad })`; solo se dibuja aquí, `shared/layout` no cambia hasta que se regenere con la opción). Página sin migas, como Seguridad.
- Dos bloques: filtros (origen y fechas) y lista. Una sola columna de hasta 880 px.
- Fila: ícono de la acción, acción en español, origen por rol («Origen: Tú / Soporte de Nimbo / Administración de Nimbo», nunca nombre ni correo), recurso como tipo y cantidad, y fecha con hora a la derecha (a 360 px, arriba de la acción). Fechas «5 oct 2026», «30 sept 2026» (`Intl es-GT`), hora de Guatemala. Nunca nombres de archivo.
- Acciones internas: no dependen del color. Llevan distintivo «Acción interna» con ícono, franja izquierda de 3 px, ícono relleno en vez de claro, origen con ícono propio y un bloque «Motivo escrito por …» (≤ 500 caracteres, `overflow-wrap: anywhere`). El cliente no puede ocultarlas (CA-13): no hay control para eso.
- Filtros: «Origen» como grupo de radios en segmentos (Todo · Yo · Personal de Nimbo; marca activa con ícono y barra inferior) y «Desde»/«Hasta» con `input type=date` nativo. Se aplican al cambiar; no hay botón «Aplicar». «Limpiar filtros» solo aparece con filtros activos. Un contador `role="status"` anuncia el resultado. Sin búsqueda de texto.
- «Cargar más» (20 por página): al pulsarlo pasa a «Cargando más…» deshabilitado con `aria-busy`; si falla, un `Alert` de error con «Reintentar» sin perder lo ya cargado; al terminar, «Llegaste al final: no hay actividad más antigua.».
- Vacío sin filtros oculta los filtros (no hay nada que filtrar). Vacío con filtros ofrece «Limpiar filtros». Error de carga: mensaje de la spec con `correlationId` y «Reintentar».
- Rango inválido: error `role="alert"` ligado a los dos campos (`aria-invalid`, `aria-describedby`) y no se consulta.
- Los roles internos ven la misma página con solo sus propios eventos (CA-12). No tiene estado de solo lectura ni de límite de plan: es consulta.
- Los textos de acciones y recursos deben salir de un catálogo de la API/frontend, no del evento; límites y fechas vienen de la API.

## Contraste de pares nuevos (WCAG 2.1)
Todos reutilizan pares ya verificados en Seguridad: `primary-hover` sobre `brand` al 12 % (6.03), blanco sobre `primary-hover` (ícono relleno de acción interna, 6.96), `secondary-foreground` sobre `background` (metadatos de acciones internas) y `muted-foreground` sobre `card` (4.76; sobre `background` 4.56), `destructive` sobre `destructive-soft` al 12 % (4.81), `success-foreground` sobre `card` (5.25).

## Preguntas abiertas
1. ¿«Administración de Nimbo» y «Soporte de Nimbo» se distinguen en filtro? Se asumió que «Personal de Nimbo» incluye ambos.
2. Fila «Cuenta» como recurso de acciones sobre la cuenta (cuota, sesiones): ¿rotularlo «Cuenta» o «Tu cuenta»?
3. Rango por defecto: se muestra todo el historial sin fechas.
