# ADR-0004 — ONLYOFFICE Docs como editor, solo para `.docx`

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-10-16, Adrián) |
| Fecha | 2026-10-16 |
| Decisores | Adrián (architect), equipo Nimbo |
| Specs relacionadas | 016 (consumidora), 014 (historial), 022 (salud y alertas); ADR-0012, ADR-0030, ADR-0029; DF-05, DF-20, DF-29 |

## Contexto

El producto se diferencia por editar `.docx` en el navegador, varios a la vez, sin convertir el archivo (CLAUDE.md, punto 1;
RF-25, RF-26, RF-28). Hay que decidir qué editor se embebe, para qué formatos y cómo se integra. Restricciones: equipo de 4,
10 semanas (la 016 es de la Fase 2), servidor de producción de 8 GB donde el editor ocupa ~4 GB (`product-context.md` §8),
staging de 4 GB (por eso el perfil `onlyoffice` de `compose.yml` está apagado por defecto), y el editor no puede tumbar
cargar, descargar ni navegar (RNF-09, Art. XII). El enunciado exige defender cada decisión.

## Opciones consideradas

1. **ONLYOFFICE Docs (Community, contenedor propio), solo `.docx`, integrado por configuración firmada con JWT y `callback`.**
   - Pros: edita OOXML nativo sin convertir (RN-1 de 016); coedición y cursores ya vienen resueltos, así que Nimbo solo
     publica la lista de participantes (016 RN-9); el contrato de integración es pequeño (configuración JWT + `callback` con
     estados 1, 2, 3, 4, 6, 7) y se encaja en un puerto, `IDocumentEditor`, que oculta el producto (Art. V.2 a); el equipo ya fijó su
     servicio en `compose.yml` y en `.env.example`.
   - Contras: ~4 GB de RAM; caídas y reintentos propios que obligan a un `callback` idempotente (DF-05, DF-20); la edición es
     de un tercero y su licencia Community limita las conexiones simultáneas (suficiente para 25 usuarios, RNF-02); llamadas
     de ONLYOFFICE al `api` por red interna de Docker (`ALLOW_PRIVATE_IP_ADDRESS` solo en local y staging).
2. **Editor embebido propio (TipTap/ProseMirror + Yjs) con exportación a `.docx`.**
   - Pros: sin servicio de 4 GB; control total de la presencia.
   - Contras: la fidelidad `.docx` (estilos, tablas, imágenes, encabezados) es un proyecto en sí mismo; viola «sin conversión
     de formato»; imposible en 10 semanas con 4 personas.
3. **Collabora Online (LibreOffice) o editores SaaS (Google Docs, Office Online).**
   - Pros: Collabora es autoalojable y soporta `.docx`.
   - Contras: el SaaS saca el contenido del cliente de Nimbo (rompe RNF-05 y la privacidad del producto); Collabora usa
     WOPI, un protocolo más grande que el `callback` de ONLYOFFICE, con un peso de memoria similar y sin ventaja para el equipo.
4. **Posponer y entregar solo descarga y carga de `.docx`.**
   - Pros: elimina el riesgo de memoria y de integración.
   - Contras: la edición colaborativa es la primera diferenciación del producto; sin ella se evalúa mal la funcionalidad.

## Decisión

Opción 1. Nimbo embebe ONLYOFFICE Docs únicamente para `.docx` (los demás tipos se descargan o previsualizan, nunca se
editan: `product-context.md` §9). El módulo `editing` es el único que conoce el producto, detrás de `IDocumentEditor`
(`signConfig`, `verifyCallback`, `download`, `dropUser`, `isAvailable`), implementado por `OnlyOfficeEditor`. Reglas de
integración: la configuración del editor y el cuerpo del `callback` se firman con JWT (`ONLYOFFICE_JWT_SECRET`, HS256, usando
`@nestjs/jwt`, ya instalado: no se agrega ninguna dependencia npm); solo el estado 2 crea versión (016 RN-4); el servidor nunca
expone URLs de MinIO al editor: ONLYOFFICE lee el documento desde un endpoint del `api` con enlace firmado y de vida corta; el
servicio es opcional (sin sus variables, abrir responde `EDITING_UNAVAILABLE`, y el resto del producto no se entera:
la disponibilidad se revisa con `IDocumentEditor.isAvailable` en cada apertura; ~~`OnlyOfficeHealthIndicator`, DF-29~~ omitido (PD-113)). El procesamiento del guardado queda fijado por ADR-0029. Es defendible porque obtiene
coedición `.docx` nativa por una integración de un solo contrato, con la sustitución del editor aislada en un puerto.

## Consecuencias

- Positivas: la diferenciación del producto con poco código propio; fidelidad total del formato; un solo puerto cambia si se
  sustituye el editor.
- Negativas / deuda aceptada: ~4 GB de RAM de producción reservados y perfil aparte en staging; dependencia de la disponibilidad y la
  versión de un tercero; el tope editable (50 MB iniciales, `EDITING_MAX_DOC_BYTES`) es una cifra a validar en staging.
- Cómo sabremos si fue un error: si el smoke de 016 o la prueba de carga (023, 25 usuarios) muestra presión de memoria que obligue a
  apagar otros servicios, o si la integración exige más estados de `callback` de los previstos; entonces se reabre con la opción 3
  (Collabora) antes de la Fase 4.
