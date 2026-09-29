# ADR-0020 — Validación HTTP con zod desde `packages/contracts` (enmienda la parte b de ADR-0015)

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-09-27, Adrián) |
| Fecha | 2026-09-27 |
| Decisores | Adrián (architect), equipo Nimbo |
| Specs relacionadas | 001 (CA-5, CA-6, CA-7, CA-22), 002 (política de contraseña al restablecer), ADR-0015 (b), ADR-0008 (regla 3) |

## Contexto

ADR-0015 (b) eligió zod para el entorno y para `packages/contracts`, y dejó `class-validator` para los DTO HTTP, con
un `ValidationPipe`. `conventions.md` (§API REST) repite esa regla. La 001 es la primera spec con un cuerpo HTTP y su
CA-22 exige que el formulario de `web` valide «con las **mismas** reglas que la API (un solo esquema en
`packages/contracts`)».

`class-validator` depende de clases con decoradores y de `reflect-metadata`, que no encajan en `apps/web` ni en
`contracts` (lo dice la propia ADR-0015). Con él, la política de contraseña (D-6) y las reglas del registro
quedarían escritas dos veces. `class-validator` todavía no está instalado. Además, ADR-0015 puso como señal de error
que aparezca una tercera librería de validación.

## Opciones consideradas

1. **zod desde `contracts` + `ZodValidationPipe` en `shared`** (esta propuesta)
   - Cómo funciona: el controlador valida el cuerpo con el esquema de `contracts`, el mismo que usa
     `react-hook-form` en `web`.
   - Pros:
     - una sola fuente para las reglas de entrada y para los tipos (`z.infer`);
     - una sola librería de validación en todo el monorepo;
     - mensajes en español definidos una vez.
   - Contras:
     - un pipe propio de unas decenas de líneas;
     - `@nestjs/swagger` no lee esquemas zod: cuando se genere OpenAPI hará falta un generador desde zod.
2. **`class-validator` en el `api` y zod en `web`**
   - Contras: dos esquemas de la misma regla, que pueden divergir sin que ninguna prueba lo vea, y contradice CA-22
     (Art. VI).
3. **`nestjs-zod`** (paquete que agrega `createZodDto`, pipe y compatibilidad con Swagger)
   - Pros: resuelve también OpenAPI.
   - Contras: una dependencia más para algo que hoy son unas decenas de líneas. Ninguna spec activa genera OpenAPI
     todavía (Art. V).
4. **Posponer**: no es posible, la 001 necesita validar su primer cuerpo.

## Decisión

Opción 1.

- **Esquemas en `contracts`**: los DTO HTTP de entrada y de salida son esquemas zod en `packages/contracts/src/<modulo>/`,
  con objetos **estrictos** (`.strict()`) cuando la spec prohíbe campos extra (001 CA-7).
- **Pipe en `shared`**: `ZodValidationPipe(schema, toError)` vive en `shared/presentation`.
  - Recibe una fábrica de error del módulo, `(issues: FieldIssue[]) => DomainError`, para que el `code` lleve el
    prefijo del módulo (`IDENTITY_INVALID_INPUT`).
  - `shared` no importa contratos de ningún módulo: solo usa la conversión genérica de *issues* que vive en la raíz
    de `contracts`.
- **Errores**: la forma `fields` del error es un contrato común y vive en `contracts/src/error.ts`. El tipo
  `FieldIssue` que usa `DomainError` se declara en `shared/domain`, porque el dominio no importa `@nimbo/contracts`
  (ADR-0008, regla 3). El filtro, que tipa su respuesta con `ErrorResponse`, garantiza que ambos coincidan.
- **Dónde no entra zod**: sigue prohibido en `domain/`. Las reglas que el dominio necesita le llegan como
  parámetros desde la aplicación.
- **`class-validator` no se instala.** ADR-0015 queda `Aceptado (parte b enmendada por ADR-0020)`, y
  `conventions.md` §API REST cambia «`class-validator` en DTOs» por «esquemas zod de `contracts` con
  `ZodValidationPipe`» cuando este ADR se acepte (PD-37).
- **OpenAPI**: el generador desde zod se decide con su propio ADR menor en la spec que publique la documentación.

## Consecuencias

- Positivas:
  - `web` y `api` aplican exactamente las mismas reglas, y la 002 reutiliza la política de contraseña;
  - una librería de validación en lugar de dos;
  - el tipo del cuerpo sale del esquema.
- Negativas / deuda aceptada:
  - el pipe y la conversión de *issues* son código propio que hay que probar;
  - OpenAPI queda sin resolver hasta que una spec lo pida;
  - `contracts` crece con un archivo por módulo, cada uno con una sola spec dueña.
- Cómo sabremos si fue un error:
  - si el pipe propio crece más allá de validar y convertir errores (transformaciones, Swagger, grupos) → adoptar
    `nestjs-zod` con ADR;
  - si algún módulo necesita validar en el `api` una regla que `web` no puede conocer → validarla en el dominio o
    la aplicación, nunca con otra librería.
