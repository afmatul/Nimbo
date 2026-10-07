# ADR-0026 — Motores de previsualización en el navegador: `pdfjs-dist`, `@zip.js/zip.js` y `saxes`

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-10-06 |
| Decisores | Adrián + architect |
| Specs relacionadas | 017 — Previsualización (RF-27) |
| Relacionado | [ADR-0025](0025-inline-solo-en-previsualizacion-aislada.md) (Rechazado) |

## Contexto

RF-27 exige previsualizar PDF, XLSX, PPTX, texto e imagen. Tras rechazar ADR-0025, el cliente obtiene
los bytes por `fetch` (helper único `object-bytes.ts`, `credentials: 'omit'`) y los renderiza él mismo;
hace falta un motor por formato. Ver [plan 017 §2.4](../../specs/017-previsualizacion/plan.md). Equipo de
4, 10 semanas y servidor de 8 GB con ONLYOFFICE ocupando ~4 GB: no hay margen para servicios nuevos.

## Opciones consideradas

1. **SheetJS.** Carga el libro completo en memoria, no cubre PPTX y su distribución es por CDN propia con
   licencia particular. Descartada.
2. **Conversión en backend (LibreOffice/Gotenberg).** Imagen pesada en un servidor de 8 GB y conversores
   fuera de alcance de 017. Descartada.
3. **Visor nativo del navegador con `inline`.** Rechazada por ADR-0025.
4. **PDF.js + zip.js + saxes en el cliente (elegida).** `pdfjs-dist@6.4.299` (Apache-2.0),
   `@zip.js/zip.js@2.23.0` (BSD-3-Clause) y `saxes@6.0.0` (ISC). Lectura por rangos y XML en streaming.
5. **Posponer.** Deja RF-27 sin motor; no sostenible para la fecha de la fase.

## Decisión

Se aceptan, con versiones exactas fijadas, las tres dependencias directas **solo en `apps/web`**, usadas
desde workers propios (PDF.js con su worker local de la misma versión; un worker OOXML propio con
`useWebWorkers: false` para no anidar). `saxes` ya es transitiva por jsdom; se declara directa. Sin
CDN, sin wrappers React ni iframes. Cualquier cambio de versión o motor requiere actualizar este ADR.

## Consecuencias

- **Configuración del worker de PDF.js con Next/Turbopack:** riesgo de empaquetado; prueba temprana en
  T-08a antes de construir sobre él.
- **Memoria del cliente:** riesgo aceptado con mitigación: ventanas de páginas/hojas/diapositivas,
  liberación de las anteriores, fallo saneado con acción Descargar y sin límites nuevos.
- **Seguridad:** sin scripting en PDF: solo apariencias estáticas, sin viewer, scripting manager/sandbox
  ni AnnotationLayer interactiva, `enableXfa: false` (plan 017 §2.4); XML hostil rechazado
  (DTD/entidades no admitidas, rutas inválidas, partes duplicadas); sin fetch externo desde OPC.
- **Licencias:** Apache-2.0, BSD-3-Clause e ISC, compatibles con el proyecto.
- **Cuándo revisar:** si el worker no se empaqueta de forma fiable o la memoria resulta inviable en la
  demo, volver a este ADR.
