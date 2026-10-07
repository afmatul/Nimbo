# ADR-0025 — Permitir `inline` solo en la URL temporal de previsualización aislada

| Campo | Valor |
|---|---|
| Estado | Propuesto |
| Fecha | 2026-10-06 |
| Decisores | Equipo Nimbo (cuatro integrantes; acuerdo pendiente) |
| Specs relacionadas | 017 — Previsualización; 005 — Carga y descarga |
| Proponente | Abel |

## Contexto

RF-27 pide previsualizar PDF, XLSX, PPTX, texto e imagen. El borrador de
[017](../../specs/017-previsualizacion/spec.md), CA-11, requiere una URL distinta de descarga con
`Content-Disposition: inline`. La [constitución IX.7](../sdd/constitution.md) dice literalmente:

> Contenido servido desde origen aislado con descarga forzada; límites de tasa en operaciones sensibles (RNF-07, RNF-08).

**El texto no distingue descarga de previsualización.** Su lectura literal exige descarga forzada también
para la vista previa y entra en tensión con CA-11. RNF-07 conserva esa misma formulación. Se propone una
interpretación limitada para RF-27; no es una excepción vigente ni se da por resuelta por figurar en el borrador.

La [005](../../specs/005-carga-y-descarga/spec.md), CA-13/14, exige cinco minutos, un objeto y descarga
forzada desde origen aislado. Su [plan §6](../../specs/005-carga-y-descarga/plan.md) fija
`presignDownload` con `attachment`, `application/octet-stream` y `no-store`. Con cuatro integrantes,
diez semanas y un servidor de 8 GB, interesa conservar el flujo directo objetos → navegador y limitar
el contenido renderizable, sin introducir un proxy de bytes ni ampliar la arquitectura.

Trazabilidad: 017 CA-3 a CA-5 (autorización), CA-8 (preservar descarga), CA-10 (bitácoras), CA-11
(URL de vista) y CA-12 (tasa); 005 CA-13/14/16/17/19; RF-27 y RNF-05, RNF-06, RNF-07, RNF-17.
[ADR-0005](0005-autorizacion-en-la-consulta-y-rls.md), arquitectura §6/§7.1, modelo M2 y DF-01/32/16
son las fronteras existentes. La parte de vista previa de DF-15 sigue abierta.

## Opciones consideradas

1. **Descarga forzada en toda URL de contenido.** Pros: respeta el literal de IX.7 y reduce la
   superficie de renderizado; mantiene un único comportamiento de entrega. Contras: no cumple
   CA-11 de 017 y obliga a replantear esa spec para atender RF-27.
2. **`inline` exclusivamente en la URL de previsualización del origen aislado (recomendada).**
   Pros: permite satisfacer CA-11 sin debilitar la descarga de 005, reutiliza el aislamiento y evita
   trasladar bytes por API/web. Contras: aumenta la superficie de renderizado y exige verificar
   las garantías por formato; necesita acuerdo explícito sobre la interpretación constitucional.
3. **Posponer la decisión.** Pros: conserva la regla literal mientras el equipo revisa la tensión.
   Contras: deja CA-11 sin respaldo aceptado y retrasa la definición defendible de 017; no cumple
   el requisito de registrar esta interpretación antes de `/plan 017`.

## Decisión

**Abel propone la opción 2; el equipo aún no la ha aceptado.** La interpretación propuesta mantiene
la descarga forzada para descargar y permite `inline` únicamente para previsualizar conforme a RF-27,
con estas condiciones acumulativas:

- **URL de vista separada:** firmada, distinta de la URL de descarga, de cinco minutos y un solo
  objeto; host de objetos separado de web/API, sin compartir cookies de sesión de la app.
  `Content-Disposition: inline` solo allí, `X-Content-Type-Options: nosniff` y MIME del catálogo de
  005 según el tipo real validado, nunca un MIME arbitrario enviado por el cliente. Los bytes van
  directamente de objetos al navegador, sin proxy por API ni por el origen web (017 CA-11).
- **Descarga preservada:** original íntegro, cinco minutos, un objeto y origen aislado, con
  `Content-Disposition: attachment` y `Content-Type: application/octet-stream`; se conserva el
  contrato `presignDownload` de 005. La vista no incrusta la URL de descarga (017 CA-8/11).
- **Alcance cerrado:** PDF, XLSX, PPTX, TXT, MD y PNG/JPG/JPEG/GIF/WebP. DOCX, `otro`, SVG, BMP y
  HEIC no reciben URL de vista (017 RN-1). No se habilita HTML, script ni Markdown convertido a
  HTML. Se mantienen todas las garantías de CA-1: solo lectura, original intacto y sin nueva
  versión; PDF completo sin ejecutar su JavaScript; imagen tal cual; TXT/MD literal; valores de
  cada hoja XLSX sin recalcular fórmulas; texto de cada diapositiva PPTX sin animaciones y el estado
  vacío con opción Descargar. `inline` por sí solo no garantiza estos comportamientos.
- **Autorización sin ampliación:** servicios con `actor: Actor`, filtro previo mediante
  `accessibleNodes(actor)` dentro de la consulta y RLS como segunda barrera, según ADR-0005.
  Sin sesión: 401; roles internos: 403, nunca contenido, vistas ni medios de acceso; ajeno e
  inexistente indistinguibles (017 CA-3 a CA-5; 005 CA-16/17).
- **Operación:** bitácoras con `correlationId`, sin contenido, nombres, contraseñas, tokens,
  claves de enlace/objeto ni URLs firmadas, también en errores (017 CA-10). La emisión de URLs de
  vista tiene límite de tasa separado con clave `storage:preview-url:` y respuesta
  `429 STORAGE_TOO_MANY_REQUESTS` con `Retry-After` (CA-12), sin fijar nuevas cifras ni alterar
  el límite de descarga de 005 CA-19.

**Aceptación pendiente:** al aclarar el alcance de un principio constitucional, esta propuesta requiere
acuerdo de los cuatro integrantes en una reunión de revisión. Ese acuerdo no sustituye la aprobación
de la spec y del plan 017 por Adrián. Registrar el ADR antes de `/plan 017` satisface el requisito
documental de 017 §5; no aprueba la excepción ni autoriza implementación. No reemplaza ADR-0005,
no cambia la estructura ni acepta la parte de previsualización de DF-15.

## Consecuencias

- **Positivas esperadas:** RF-27 puede usar una entrega temporal diferenciada y aislada, con la
  descarga de 005 íntegra y forzada; se conserva el flujo directo sin consumo de API/web como proxy.
- **Negativas / deuda propuesta:** renderizar contenido expone más superficie que `attachment`.
  El aislamiento, MIME validado y `nosniff` no eliminan ese riesgo ni sustituyen las garantías
  de CA-1; habrá que demostrar ambas rutas y el comportamiento por formato en el futuro plan.
- **Verificación futura en `/plan 017`:** cabeceras reales de URL preview frente a download;
  que manipular la URL no permita cambiar objeto, MIME, disposición, vigencia ni eludir las
  garantías; expiración, aislamiento de origen/cookies, autorización y ausencia de datos
  sensibles en bitácoras, junto con CA-1 y el límite separado de CA-12.
- **Cómo sabremos si fue un error:** si la vista requiere relajar descarga o autorización,
  compartir sesión/origen de la app, habilitar contenido activo o incumplir CA-1/11. En ese caso
  la opción 2 no sostiene la interpretación y debe volver al equipo para revisión.
