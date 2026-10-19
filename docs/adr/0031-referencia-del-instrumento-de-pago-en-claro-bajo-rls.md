# ADR-0031 — La referencia del instrumento de pago se guarda en claro bajo RLS, no como hash

| Campo | Valor |
|---|---|
| Estado | Propuesto (2026-10-18); falta el acuerdo del equipo (Adrián). **Delimita** el alcance de la constitución Art. IX.6 y de la regla de CLAUDE.md «tokens y claves siempre como hash» |
| Fecha | 2026-10-18 |
| Decisores | `architect` (revisión de M-2 del plan 010), Juan Marcos (dueño de `billing`), Adrián (aprueba) |
| Specs relacionadas | 010 (RN-2, CA-1, CA-2; M-2 de la auditoría del PR #63); 009 (RN-9, `transaccion`) |

## Contexto

En la auditoría de la 010 (PR #63, M-2), Adrián señaló que `IPaymentGateway.authorize(last4, amount)` estaba diseñado
desde el simulador: una pasarela real no cobra con los últimos 4. Juan Marcos decidió que la pasarela emita una
**referencia del instrumento**, opaca y sin el número (RN-2), cuando aprueba un cobro con la tarjeta presente. La
renovación automática cobra con esa referencia. El contrato queda así:
`authorize(instrument: PaymentInstrument, amount: Money) → GatewayDecision` (plan 010 §2). Las pasarelas reales funcionan
igual (método de pago guardado, `pm_…`/`card_…`): Nimbo guarda el identificador y lo **reenvía** a la pasarela, que solo
lo acepta junto con la clave secreta del comercio.

La constitución (Art. IX.6) y CLAUDE.md dicen «tokens y claves guardados solo como hash». La referencia tiene que volver a
la pasarela, así que un hash la deja inservible. Hay que decidir cómo se guarda (`transaccion.referencia_instrumento`) sin
saltarse la regla en silencio.

Fuerzas: equipo de 4, Fase 2 ya fuera de fecha, pagos **simulados** (ADR-0006 pendiente, sin dinero real,
`product-context.md` §9), prueba de aislamiento bloqueante, defensa en la exposición («¿por qué este token no está
hasheado?»).

## Opciones consideradas

1. **A. En claro, bajo RLS y con controles de exposición.** `varchar(64)` en `transaccion`, solo en aprobadas (`CHECK`).
   - Pros: es lo que exige el contrato de una pasarela real; no hace falta código ni clave nueva; la tabla ya tiene RLS
     forzado solo para el dueño `CLIENT`, sin `UPDATE` ni `DELETE` (009). Sin la clave del comercio, la referencia no
     cobra nada (y en el simulador no existe ninguna).
   - Contras: quien obtenga un volcado de la base ve las referencias. La regla de Art. IX.6 necesita una aclaración escrita
     para que nadie lo tome por un descuido.
2. **B. Cifrado reversible (AES-256-GCM) con una clave del backend** (`PAYMENT_REF_KEY` en el entorno).
   - Pros: un volcado de la base, por sí solo, no expone la referencia.
   - Contras: suma código criptográfico, una variable secreta nueva, rotación de claves y pruebas, y todo protege un valor
     que, robado, no cobra nada sin la clave de la pasarela. El atacante que tiene la base y el entorno del backend tiene las
     dos claves de todos modos. Con pagos simulados es YAGNI (Art. V).
3. **C. Que el simulador derive la referencia de algo hasheable** (p. ej., guardar `hash(ref)` y que el simulador
   reconozca el perfil por el hash).
   - Contras: es justo el defecto de M-2. El puerto vuelve a tener la forma del simulador, y una pasarela real no puede
     recibir un hash. Descartada.
4. **D. Posponer** (renovar sin instrumento, como en la 009). CA-1 y CA-2 (RF-22, «Debe» de la Fase 2) no se cumplen. No
   es viable.

## Decisión

**Opción A**, con estas reglas:

1. **Alcance de Art. IX.6**: «solo como hash» vale para los secretos que **Nimbo emite y después verifica** (verificación
   de cuenta, restablecimiento, refresh, claves de enlaces públicos). En esos casos basta con comparar, así que el hash
   no quita nada. **No** vale para las credenciales que emite un tercero y que Nimbo debe **reenviar** a ese tercero. La
   única hoy es la referencia del instrumento. Cualquier otra que aparezca necesita un ADR propio.
2. La referencia es opaca: nunca contiene el número completo ni el CVC (RN-9 de la 009). Solo la pasarela conoce su
   formato.
3. **Controles obligatorios** (plan 010 §2, §5 y §6):
   - RLS forzado de `transaccion` (solo el dueño `CLIENT`); ningún rol interno la ve. Ninguna función `SECURITY DEFINER`
     (ADR-0021) la devuelve.
   - Una sola consulta la selecciona: `IPaymentRepository.findLastApprovedCard`. La usan solo el renovador y el aviso
     previo, en el `worker`. Ninguna respuesta HTTP, esquema de `contracts`, auditoría, correo ni bitácora la incluye.
     Los lectores del historial listan columnas explícitas sin ella.
   - `instrument`, `instrumentRef` y `referencia_instrumento` están en los campos redactados del logger.
   - La prueba de aislamiento comprueba que B no lee la referencia de A.
4. Si algún día se integra una pasarela real cuyas referencias sirvan **sin** la clave del comercio, se revisa este ADR
   y se pasa a la opción B.

## Consecuencias

- Positivas: el puerto `IPaymentGateway` tiene la forma de una pasarela real (DIP), sin criptografía ni secretos nuevos.
  La excepción queda escrita y acotada a un caso, así que en la exposición se defiende con un criterio («emitir y
  verificar» frente a «recibir y reenviar») y no como una excepción suelta.
- Negativas / deuda aceptada: un volcado de la base muestra referencias. Mitigación: sin la clave de la pasarela no
  sirven, y con el simulador no hay ninguna.
- Documentos a actualizar al aceptar: la constitución Art. IX.6 y la prohibición de CLAUDE.md («tokens y claves siempre
  como hash») suman «emitidos y verificados por Nimbo; las credenciales de terceros que se reenvían, ADR-0031». ADR-0006
  (pendiente) recoge el contrato de `IPaymentGateway` cuando se redacte. DF-77 lo cita.
- Cómo sabremos si fue un error: si aparece la referencia en una respuesta, una bitácora o una consulta que no sea
  `findLastApprovedCard`; si otra credencial «de reenvío» quiere usar esta excepción sin ADR propio; o si se integra una
  pasarela real cuyos tokens sirven sin la clave del comercio.
