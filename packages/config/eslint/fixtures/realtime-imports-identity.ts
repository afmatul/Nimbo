// Fixture negativo de `boundaries.js` (PD-24): `realtime` es transversal y no depende de ningún módulo de negocio
// (architecture.md §3, regla 5); valida el token con el puerto de `shared`, no con `identity`.
export { JwtStrategy } from '../../identity/infrastructure/jwt.strategy';
export { IdentityModule } from '../../identity';
