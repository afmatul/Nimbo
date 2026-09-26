# Mockup: Correos de registro

- **Spec**: 001
- **Hoja de la entrega**: 02d
- **Origen**: HTML empaquetado y autocontenido (`.html`, Cielo Sereno, lienzo de ≈ 1490 px con el rótulo de la hoja). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - registro: correo con el enlace de verificación y aviso de intento de registro (`correos--registro.html`)
- **Capturas**: `docs/design/capturas/identity/correos/` (`correos--<estado>--<360|1440>.png`)

## Decisiones de UX
- Plantillas de 600 px de ancho con encabezado De / Para / Asunto.
- El correo de verificación trae el botón y el enlace en texto para copiarlo.
- El aviso de intento de registro no crea otra cuenta, ofrece iniciar sesión o restablecer la contraseña y se envía como máximo una vez cada 24 h (D-17).

## Pendiente
- Texto de advertencia: dice «Cualquier persona con este enlace puede verificar tu cuenta»; con D-20 el enlace abre sesión, así que la spec pide «quien lo abra entrará a tu cuenta».
- Dominio de ejemplo `nimbo.app`; el dominio del proyecto es `nimbo.me` (D-12).
- Los correos de la spec 002 (restablecer contraseña, dispositivo nuevo) irán en esta misma carpeta como otras variantes.
