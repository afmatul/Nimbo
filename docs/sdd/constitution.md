# Constitución del proyecto Nimbo

Principios que ningún agente ni integrante puede saltarse. Cambiarlos requiere un ADR y el acuerdo
de los cuatro integrantes en una reunión de revisión.

---

## Artículo I — La spec manda

1. Todo cambio de comportamiento nace de una spec en `specs/NNN-slug/`.
2. La spec describe **qué** y **por qué**; el plan describe **cómo**; las tareas describen **en qué orden**.
3. Si la implementación descubre que la spec está mal, se detiene, se corrige la spec y se continúa.
4. Correcciones sin cambio de comportamiento (refactor, typo, dependencia menor) no requieren spec, pero sí PR y revisión.

## Artículo II — Trazabilidad

Cada criterio de aceptación referencia al menos un `RF-xx` o `RNF-xx` de la propuesta.
Cada tarea referencia un criterio. Cada prueba de aceptación nombra el criterio que verifica
(`it('CA-3: rechaza la carga que excede la cuota', …)`). Lo que no se puede rastrear hasta un requisito no se construye.

## Artículo III — Pruebas primero

1. Para lógica de dominio y de aplicación: la prueba se escribe antes que el código y se ve fallar.
2. Integración siempre contra servicios reales (Testcontainers), nunca contra mocks de Postgres, Redis o MinIO.
3. Las pruebas de aislamiento son bloqueantes en CI (RNF-05).
4. Cobertura mínima de lógica de negocio: 60 % (RNF-11). La cobertura es un piso, no una meta.

## Artículo IV — SOLID aplicado a Nimbo

| Principio | Qué significa aquí | Ejemplo |
|---|---|---|
| **S** — Responsabilidad única | Una clase cambia por una sola razón de negocio. | `QuotaService` decide si una carga cabe; `UploadService` gestiona la carga; `MagicBytesDetector` solo detecta el tipo. |
| **O** — Abierto/cerrado | Se extiende agregando implementaciones, no editando condicionales. | `ExtractorRegistry` + `ITextExtractor`: agregar `.xlsx` (RF-31) es registrar un extractor nuevo. Igual con `IAccessPolicy` y `BaseOptimizer`. |
| **L** — Sustitución de Liskov | Toda implementación de un puerto cumple el mismo contrato, incluidas sus fallas. | `SimulatedPaymentGateway` y una futura pasarela real devuelven los mismos `ChargeResult`; `PdfLocation`, `DocxLocation` y `TextLocation` responden `label()` sin casos especiales. |
| **I** — Segregación de interfaces | Interfaces pequeñas por consumidor. | `storage` usa `IPlanLimitsProvider` e `intelligence` usa `IAgentQuota`, no todo `SubscriptionService`. `IMailer` e `INotifier` son distintos aunque los implemente el mismo módulo. |
| **D** — Inversión de dependencias | Dominio y aplicación dependen de puertos; la infraestructura los implementa. | `AgentService` → `ILanguageModel` ← `GeminiFlashModel`; `FileService` → `IObjectStorage` ← `MinioStorageAdapter`. |

## Artículo V — YAGNI

1. Se construye lo que pide una spec activa, nada más.
2. **Regla de interfaces**: se crea una abstracción solo si (a) aísla un sistema externo o una librería de infraestructura (MinIO, Gemini, ONLYOFFICE, Redis, correo, reloj, Argon2, JWT, procesos del sistema), (b) es un repositorio (mantiene el dominio libre de TypeORM), (c) la propuesta exige sustituibilidad (pagos, modelo de lenguaje), (d) permite a un módulo depender de otro sin ciclo, o (e) ya existen dos implementaciones reales (políticas, extractores, optimizadores). Los puertos de los diagramas de clases ya cumplen esta regla; uno nuevo debe justificar cuál cumple. Ejemplo de lo que sobra: `ISecretCipher` (DF-10).
3. Prohibido: parámetros «por si acaso», capas genéricas sin segundo uso, feature flags sin fecha de retiro, microservicios.
4. Lo que está en «Fuera de alcance» (`product-context.md` §9) no se implementa, ni «a medias».

## Artículo VI — DRY

1. DRY es sobre **conocimiento**, no sobre texto parecido. Dos reglas de negocio que coinciden por casualidad se quedan separadas.
2. **Regla de tres**: se extrae una abstracción compartida a la tercera repetición, no a la segunda.
3. Fuente única de verdad para:
   - Límites de planes → tabla `plan` (sembrada por migración) → `PlanLimits`, leídos vía `IPlanLimitsProvider`. Nunca números mágicos.
   - «Qué puede ver este actor» → `access.accessibleNodes(actor)`; «qué puede hacer» → `PermissionResolver` + políticas.
   - Ciclo de vida de versiones → un solo dueño (DF-17).
   - Contratos HTTP y tipos compartidos → `packages/contracts`.
   - Matriz de roles → `RolesGuard` + decorador `@Roles()`; niveles sobre recursos → `IAccessPolicy`.
   - Mensajes de error visibles → catálogo de errores del frontend, indexado por código de error.

## Artículo VII — Código limpio

1. Nombres que revelan intención. Identificadores en inglés; UI, documentación y mensajes al usuario en español.
2. Funciones cortas (guía: ≤ 30 líneas) con un solo nivel de abstracción. Máximo 3 parámetros; más → objeto.
3. Sin comentarios que repiten el código. Los comentarios explican **por qué**.
4. TypeScript `strict`. Prohibido `any` sin comentario justificando; preferir `unknown` + validación.
5. Errores de dominio tipados (`QuotaExceededError`), traducidos a HTTP en un solo filtro de excepciones.
6. Sin código muerto, sin `console.log`, sin TODOs sin issue asociado.
7. Inmutabilidad por defecto (`readonly`, `const`); efectos secundarios en los bordes.

## Artículo VIII — Arquitectura

1. **Monolito modular** + procesos trabajadores. Cada módulo es una frontera con API pública explícita.
2. Dependencias hacia adentro: `presentation → application → domain`; `infrastructure` implementa puertos.
3. Un módulo nunca importa entidades, repositorios ni archivos internos de otro. Usa su fachada pública o un evento.
4. Sin dependencias cíclicas entre módulos (verificado por lint).
5. Toda decisión estructural significativa se registra en un ADR (`docs/adr/`).
6. **Los diagramas son parte del sistema.** Código, specs y diagramas (`docs/design/diagramas/`) no pueden contradecirse al cierre de una fase. Una desviación se registra en `design-findings.md` y se corrige en el diagrama o en el código.

## Artículo IX — Seguridad y privacidad por diseño

1. **El rol nunca da acceso a contenido.** El acceso nace de la propiedad o de una compartición explícita.
2. La autorización se resuelve en el servidor **dentro de la consulta** (RNF-05), con Row Level Security como segunda barrera. Todo servicio que toca datos de un usuario recibe `actor: Actor` (DF-01).
3. La recuperación del agente se restringe en SQL a los archivos accesibles antes de ordenar por similitud (RF-33).
4. Toda acción de un rol interno sobre una cuenta ajena se audita y es visible para el cliente (RF-07).
5. No existe suplantación. Cuentas internas y de cliente son distintas; un usuario no acumula roles.
6. Identificadores no predecibles (UUID), tokens y claves guardados solo como hash, URLs firmadas de 5 minutos a un solo objeto (RNF-06).
7. Contenido servido desde origen aislado con descarga forzada; límites de tasa en operaciones sensibles (RNF-07, RNF-08).

## Artículo X — Operabilidad

1. Cada petición y cada trabajo llevan `correlationId` en todas sus líneas de bitácora (RNF-17).
2. Todo módulo nuevo expone las métricas que su spec declare y participa en `/health/live` y `/health/ready`.
3. Una tarea no está terminada si no se puede operar: bitácoras, métricas y mensajes de error accionables.

## Artículo XI — Integridad de datos

1. Una versión de documento es válida solo cuando el objeto nuevo está íntegro en MinIO; la anterior permanece intacta mientras tanto.
2. Todo manejador de eventos externos (callback de ONLYOFFICE, pago simulado, trabajos de cola) es **idempotente**.
3. Operaciones de facturación en transacción. Eliminación lógica antes que física.

## Artículo XII — Degradación elegante

La caída de indexación, optimizador o servidor de documentos no impide cargar, descargar ni navegar (RNF-09).
Los módulos no esenciales se consumen de forma asíncrona o con manejo explícito de indisponibilidad.

## Artículo XIII — Experiencia de usuario

1. Toda pantalla nace de un mockup (`docs/design/mockups/`) o de la decisión explícita de usar patrones existentes.
2. Cielo Sereno aplicado mediante tokens; ningún color escrito a mano. RNF-13 (AA, 360 px, español) prevalece sobre el design system y el mockup.
3. Todo estado se diseña e implementa: vacío, cargando, error con acción correctiva, éxito, solo lectura, sin permiso.
4. El color nunca es el único diferenciador.

## Artículo XIV — Definición de terminado

Una tarea/spec está terminada cuando:
- [ ] Cumple todos los criterios de aceptación de su spec (`verification.md` en verde).
- [ ] Tiene pruebas automatizadas de lo que introduce y la cobertura no bajó del umbral.
- [ ] Pasa lint, typecheck y todas las suites de CI, incluida la de aislamiento.
- [ ] Está instrumentada (bitácoras con `correlationId`, métricas declaradas).
- [ ] Fue revisada por el subagente `reviewer` y aprobada por un integrante distinto del autor.
- [ ] Si tiene UI: coincide con su mockup, pasa axe a 360 y 1440 px y `ui-review.md` está en verde.
- [ ] Está desplegada en staging y se puede demostrar.
- [ ] La documentación afectada (spec, API, manuales, ADR) se actualizó en el mismo PR.
