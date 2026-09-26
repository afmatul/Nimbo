# Diseño de Nimbo

```
docs/design/
├─ diagramas/                     # Entregables del Documento de Diseño (PDF)
│  ├─ Diagrama_de_Arquitectura.pdf
│  ├─ Diagramas_de_Clases.pdf
│  └─ Diagramas_ER.pdf
├─ design-system/
│  └─ design-cielo-sereno.md      # Paleta A · Cielo Sereno (fuente original del sistema de diseño)
├─ mockups/                       # Mockups en código, una carpeta por módulo y pantalla
│  └─ <modulo>/<pantalla>/        # p. ej. storage/explorador/
└─ capturas/                      # Capturas PNG de los mockups, separadas del código
   └─ <modulo>/<pantalla>/        # misma ruta relativa que el mockup
```

## Convenciones

- **Módulos** (mismos nombres que el backend): `identity`, `storage`, `sharing`, `billing`, `editing`, `intelligence`, `optimizer`, `backoffice`, `shared` (layout, navegación, componentes comunes).
- **Pantallas**: `kebab-case` en español (`explorador`, `ficha-archivo`, `panel-agente`).
- **Capturas**: `<pantalla>--<estado>--<ancho>.png`
  - estados: `default`, `vacio`, `cargando`, `error`, `exito`, `solo-lectura`, u otro que la spec defina;
  - anchos: `360` (móvil, RNF-13) y `1440` (escritorio).
  - Ejemplo: `capturas/storage/explorador/explorador--vacio--360.png`.
- **Formato de mockup**: HTML autocontenido y empaquetado (`<pantalla>[--<estado>].html`; sin sufijo es el estado `default`).
  Se abre directo en el navegador. La vista general conserva el formato anterior de Claude Design (`.dc.html`).
- **Hojas de la entrega**: cada mockup lleva un rótulo con su número de hoja (01–14, más anexos `b`/`c`/`d`); el `README.md`
  de la carpeta indica la hoja.
- **Capturas**: se regeneran con Playwright a 360 y 1440 px (`fullPage`) para cada mockup; el `ui-designer` lo hace en `/mockup`.
- Cada carpeta de mockup tiene un `README.md` corto: qué spec cubre, estados incluidos y decisiones de UX.
- El inventario de pantallas, con su spec y su mockup, está en `docs/sdd/ui-guidelines.md` §7.

## Reglas
- Los mockups son **referencia visual**, no código de producción: `apps/web` nunca importa de `docs/design/mockups`.
- Las capturas se regeneran cuando cambia el mockup (mismo PR).
- Si el mockup contradice el sistema de diseño o un requisito (p. ej. contraste AA), manda el requisito: se corrige el mockup y se registra el hallazgo en `docs/sdd/design-findings.md`.
