// Fixture negativo de `boundaries.js` (PD-24): `access` lee tablas de `storage` solo por SQL de solo lectura
// (architecture.md §3, regla 3); nunca importa su código.
export { ArchivoOrmEntity } from '../../storage/infrastructure/persistence/archivo.orm-entity';
export { StorageModule } from '../../storage';
