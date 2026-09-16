# Spec NNN — <Título>

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | <integrante> |
| Fase | <0–4> |
| Requisitos | RF-xx, RNF-xx |
| Depende de | <NNN, NNN> |
| Última actualización | AAAA-MM-DD |

## 1. Contexto y problema
<Por qué existe esta spec. Qué duele hoy. 3–6 líneas. Sin mencionar tecnologías.>

## 2. Objetivo
<Resultado observable cuando la spec esté hecha. Una o dos frases.>

## 3. Actores
<Cliente / Administrador / Soporte / Operador / Enlace público / Sistema (trabajo programado)>

## 4. Historias de usuario
- **HU-1** Como <actor>, quiero <acción>, para <beneficio>.
- **HU-2** …

## 5. Criterios de aceptación
> Formato Dado/Cuando/Entonces. Cada criterio es verificable por una prueba automatizada y rastrea a un requisito.

- **CA-1** (HU-1, RF-xx)
  - **Dado** …
  - **Cuando** …
  - **Entonces** …
- **CA-2** (HU-1, RF-xx) — caso de error
  - **Dado** …
  - **Cuando** …
  - **Entonces** se responde `<CODIGO_ERROR>` con el mensaje «…» y no se modifica …

## 6. Reglas de negocio
- **RN-1** <regla precisa, con valores tomados del catálogo de planes, no inventados>

## 7. Requisitos no funcionales aplicables
| RNF | Cómo aplica aquí | Cómo se verifica |
|---|---|---|

## 8. Seguridad y privacidad
- ¿Toca contenido de archivos? <sí/no>. ¿Quién puede verlo?
- ¿Qué acciones van a auditoría (RF-07)?
- ¿Qué operaciones requieren límite de tasa?
- ¿Qué NO debe aparecer en bitácoras?

## 9. Experiencia de usuario
> Tabla preparada con el `ui-designer`. Rutas relativas a `docs/design/`.

| Pantalla | Mockup | Capturas | Estados requeridos | Estado del mockup |
|---|---|---|---|---|
| <pantalla> | `mockups/<modulo>/<pantalla>/` | `capturas/<modulo>/<pantalla>/` | default, vacio, cargando, error, … | Aprobado / Borrador / Pendiente |

- Mensajes clave (español, tuteo, con acción correctiva): …
- Diferencias aceptadas respecto al mockup: …
- Sin interfaz: <marcar si la spec no tiene UI>

## 10. Fuera de alcance
- <Lo que alguien podría asumir que entra y no entra.>

## 11. Preguntas
- [ABIERTA] <pregunta> — bloquea: sí/no
- [RESUELTA] <pregunta> → <respuesta> (fecha, quién)

## 12. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
