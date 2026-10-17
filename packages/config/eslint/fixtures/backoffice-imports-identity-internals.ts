// Fixture negativo de `boundaries.js` (PD-82, 011 plan §2): `backoffice` compone las fachadas de `identity` desde su
// `index.ts`; nunca entra por dentro a sus repositorios ni a su dominio (Art. VIII.3).
export { I_USER_REPOSITORY } from '../../identity/application/ports/i-user-repository.port';
export { ActorNotActiveError } from '../../identity/domain/errors';
