// Fixture negativo de `boundaries.js` (PD-82, 011 plan §2): `audit` no tiene aristas. El cliente ve solo el rol del
// actor, que ya guarda `evento_auditoria` (004 D-2), así que `audit` nunca consulta `identity`.
export { AccountDirectory } from '../../identity';
export { UsuarioOrmEntity } from '../../identity/infrastructure/persistence/usuario.orm-entity';
