---
description: Crea o actualiza el mockup en código y las capturas de una pantalla
argument-hint: <modulo>/<pantalla> [NNN de la spec] [indicaciones]
---

Pantalla y contexto: $ARGUMENTS

1. Delega en `ui-designer` en **Modo 2**.
2. Si existe un mockup en esa carpeta, que lo actualice respetando su tecnología y estructura; si no, que lo cree.
3. Deben quedar: código del mockup en `docs/design/mockups/<modulo>/<pantalla>/`, capturas por estado a 360 y 1440 px en
   `docs/design/capturas/<modulo>/<pantalla>/`, el `README.md` de la carpeta y la fila del inventario en `docs/sdd/ui-guidelines.md` §7.
4. Muestra al usuario la lista de capturas generadas y las decisiones de UX que requieren su aprobación.
