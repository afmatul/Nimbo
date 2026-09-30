// Fixture negativo de `boundaries.js` (PD-47): `storage` no importa `identity`. La escritura de
// `usuario.espacio_usado` es una excepción de tablas (DF-59), no una arista de importación.
export { UsuarioOrmEntity } from '../../../identity/infrastructure/persistence/usuario.orm-entity';
export { I_USER_REPOSITORY } from '../../identity';
