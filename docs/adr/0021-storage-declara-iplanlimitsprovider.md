# ADR-0021 — `storage` declara `IPlanLimitsProvider` (DF-51, opción A)

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-09-29 |
| Decisores | Revisión de arquitectura, sobre la propuesta de Fátima (spec 006a, RN-4) |
| Specs relacionadas | 006a, 005, 007, 009 |

## Contexto

`architecture.md` §3 pedía las dos aristas a la vez: `storage` importa `IPlanLimitsProvider` de `billing`, y `billing` importa `IObjectStorage` de `storage` para las facturas. Ese ciclo lo rechazan `import-x/no-cycle` y `boundaries.js` (ADR-0008). ADR-0001 trata `forwardRef` como señal de error.

La spec 006a necesita el puerto para sembrar el catálogo y servir límites. La spec 005 (carga) también lo usa al iniciar una subida, pero no necesita decidir `IAgentQuota`, `IIndexQueue` ni cómo se guardan las facturas.

## Opciones consideradas

1. **`storage` declara el puerto y `billing` lo implementa** (opción A de DF-51). Se elimina `storage → billing`. `editing` lo reutiliza desde `storage`.
   - Pros: se conserva la arista que §3 ya permite (`billing → storage`) y desaparece el ciclo. Es el mismo patrón que el puerto token→`Actor`: lo declara quien no debe depender del otro, lo implementa el otro módulo y la raíz de composición lo enlaza.
   - Contras: `billing` importa un contrato de `storage`. Los diagramas M2 y M4 hay que redibujarlos.
2. **`billing` deja de depender de `storage`** (opción B). Facturas con un puerto propio o generadas al vuelo.
   - Contras: resuelve un problema que 006a y 005 no tienen. La arista de facturas puede quedar en un solo sentido.
3. **Mover el contrato a `shared`** (opción C).
   - Contras: `shared` no carga reglas de negocio (DF-49, ADR-0010). Un límite de plan lo es.

## Decisión

Opción A.

- `storage` declara `IPlanLimitsProvider` y lo exporta en `modules/storage/index.ts`. No importa `billing`.
- `billing` lo implementa. En 006a importa ese puerto, no las entidades de `storage`. `AppModule` enlaza la implementación.
- `editing` lo reutiliza desde `storage` y no depende de `billing` por este puerto.
- `IAgentQuota`, `IIndexQueue` y el uso de `IObjectStorage` para facturas siguen abiertos en DF-51. Con la opción A la arista de facturas, si se mantiene, ya no es un ciclo.

Esta aceptación no bloquea el plan de 005 ni el de 006a. La carga consume el puerto dentro de `storage`. No espera a `IAgentQuota`, a `IIndexQueue` ni a la decisión de las facturas. La dependencia de 005 sobre 006a en el backlog es el catálogo, no el resto de DF-51.

## Consecuencias

- Positivas: el ciclo `storage ↔ billing` queda roto. 006a puede planificarse e implementarse. 005 no gana una compuerta nueva.
- Negativas / deuda aceptada: redibujar M2 y M4. `boundaries.js` (PD-24) debe permitir `billing → storage` y rechazar `storage → billing`. Las otras dos convenciones de §5 siguen abiertas y se cierran en la spec que las use.
- Cómo sabremos si fue un error: si `billing` no puede importar `storage`, o si un consumidor del puerto no puede obtenerlo desde `storage` sin volver a depender de `billing`.
