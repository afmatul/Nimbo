# Spec NNN — <Título>

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | <integrante> |
| Fase | <0–4> |
| Requisitos | RF-xx, RNF-xx |
| Depende de | <NNN, NNN> |
| Última actualización | AAAA-MM-DD |

## 1. Contexto y objetivo
<Por qué existe esta spec y qué resultado observable deja. 3–6 líneas, sin tecnologías.>

## 2. Historias de usuario
- **HU-1** Como <actor>, quiero <acción>, para <beneficio>.

## 3. Criterios de aceptación
> Dado/Cuando/Entonces en una o dos líneas. Cada criterio es verificable por una prueba y rastrea a un requisito.

- **CA-1** (HU-1, RF-xx) Dado …, cuando …, entonces ….
- **CA-2** (HU-1, RF-xx) — error: Dado …, cuando …, entonces se responde `<CODIGO>` con «…» y no cambia ….

## 4. Reglas de negocio
- **RN-1** <regla precisa, con valores del catálogo de planes, no inventados>

## 5. Seguridad y privacidad
- ¿Toca datos de un cliente? <sí/no> → si sí, lleva pruebas de aislamiento.
- ¿Qué va a auditoría (RF-07)? ¿Qué NO debe aparecer en bitácoras?
- ¿Qué roles internos intentan esto y qué reciben?

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|

- Mensajes clave (español, tuteo, con acción correctiva): …
- Sin interfaz: <marcar si no aplica>

## 7. Fuera de alcance
- <Lo que alguien podría asumir que entra y no entra.>

## 8. Supuestos
- <detalle que no cambia lo que el usuario ve ni un RF/RNF; se construye así>

## 9. Preguntas
- [ABIERTA] <pregunta> — bloquea: sí solo si cambia el comportamiento observable o un RF/RNF
- [RESUELTA] <pregunta> → <respuesta> (fecha, quién)

## 10. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
