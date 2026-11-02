# Mockup: Compartidos conmigo

- **Spec**: 012b (CA-8 a CA-11, HU-5, HU-6, RN-3; RF-16). Ruta `/compartidos`. API: 012 CA-22 (lista) y CA-23 (salir).
- **Origen**: HTML autocontenido generado con `../../_generadores/compartidos-conmigo/generar.js`; no se edita a mano.
  Reutiliza el marco (`marco/`), la tabla, el menú ⋮ y los estados comunes (`mis-archivos/`) y el logo, el toast y la
  barra lateral (`carpetas/`). Solo tokens de `ui-guidelines.md` §3 (tonos AA), Inter, cifras con `tabular-nums`,
  versión móvil real a 360 px. Son referencia visual; `apps/web` no los importa.
- **Estado**: Borrador. Lo pasa a `Aprobado` el equipo (Adrián).
- **Capturas**: `docs/design/capturas/sharing/compartidos-conmigo/` (`compartidos-conmigo--<estado>--<360|1440>.png`).
  Verificación: axe-core 4.14 sin violaciones en los 11 estados a 360 y 1440 px, sin desbordamiento horizontal a 360 px,
  sin objetivos menores de 24 px, sin errores de consola.

## Estados
| Estado | Archivo | Qué muestra | CA |
|---|---|---|---|
| cargando | `compartidos-conmigo--cargando.html` | Esqueleto de la tabla y «Cargando lo que te compartieron…» (`role="status"`) | CA-8 |
| con-elementos | `…--con-elementos.html` | 5 elementos (2 carpetas): nombre, tipo, quién compartió, tu nivel, fecha | CA-8 |
| vacia | `…--vacia.html` | «Todavía no te han compartido nada» + cómo llegan los elementos + «Ir a Mis archivos» | CA-8 |
| error-carga | `…--error-carga.html` | Falló la carga: error con «Reintentar» | CA-11 |
| menu-fila | `…--menu-fila.html` | Menú ⋮ de un `.xlsx` Lector: Abrir, Descargar, Salir (sin Compartir, Accesos ni escritura) | CA-6, CA-9 |
| confirmar-salir | `…--confirmar-salir.html` | `AlertDialog`: «¿Salir de «…»? Dejarás de verlo. Quien lo compartió puede volver a compartírtelo.» | CA-10 |
| saliendo | `…--saliendo.html` | Botones deshabilitados, «Saliendo…» con `role="status"`, el diálogo no se cierra | CA-10 |
| salio | `…--salio.html` | El elemento ya no está (4 en el contador) y toast «Saliste de «…».» | CA-10 |
| error-salir-inexistente | `…--error-salir-inexistente.html` | `SHARING_SHARE_NOT_FOUND`: `Alert` de error con «Actualizar lista»; la lista no cambia | CA-11 |
| error-salir-sin-conexion | `…--error-salir-sin-conexion.html` | Error de red dentro del diálogo, que sigue abierto con «Reintentar» | CA-11 |
| solo-lectura | `…--solo-lectura.html` | `ReadOnlyBanner` con enlace a renovar y «Salir» disponible en el menú | CA-10 |

## Datos de ejemplo
Hoy es 30 oct 2026; plan Equipo (cuota lateral 304 GB, 87 %, como `storage/explorador`). Cinco elementos, del más
reciente al más antiguo (S-3): carpeta «Contratos 2026» (Editor), `Informe_trimestral_Q3.docx` (Editor),
`Presupuesto_marketing.xlsx`, `Manual_de_marca.pdf` y carpeta «Fotos del evento» (Lector). «Compartido por» es el
nombre visible, nunca el correo (spec §5).

## Decisiones de UX
1. **Misma tabla que el explorador** (nombre con tipo, columnas, ⋮ por fila): cero patrones nuevos de lista. Columnas
   propias: «Compartido por», «Tu nivel» y «Fecha». A 360 px pasan a líneas bajo el nombre («De Laura Méndez» y
   «Editor · hoy»).
2. **Nivel con ícono y texto** (lápiz «Editor», ojo «Lector») en una etiqueta neutral: el color no diferencia.
3. **El nombre abre** (carpeta → su contenido; archivo → su ficha, S-4). El menú ⋮ repite «Abrir», y suma «Descargar»
   (solo archivos) y «Salir». Nunca «Compartir», «Accesos», «Renombrar», «Mover» ni «Mover a la papelera» (CA-6).
4. **«Salir» no es rojo ni destructivo**: no borra nada del propietario y es reversible (se puede volver a compartir).
   El diálogo es un `AlertDialog` con foco inicial en «Cancelar», Escape cancela, y la acción primaria es `primary`
   («Salir»). A 360 px los botones se apilan con la acción arriba, como el resto.
5. **Errores por `code`**: acceso inexistente → aviso de página con «Actualizar lista» (la lista no queda a medias:
   no se quita nada hasta actualizar); sin conexión → mensaje en el diálogo abierto con «Reintentar».
6. **Solo lectura**: la cuenta del destinatario vencida no impide salir (CA-10). El banner es el `ReadOnlyBanner` del layout.
7. **Foco**: al salir con éxito, el foco pasa al encabezado `h1` (la fila desapareció); el toast se anuncia con `aria-live`.
8. Sin orden, filtros ni paginación (spec §7).
