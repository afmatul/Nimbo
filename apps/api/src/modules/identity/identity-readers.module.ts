import { Module } from '@nestjs/common';

import { AccountContactReader } from './application/account-contact-reader';
import { I_ACCOUNT_DIRECTORY_REPOSITORY } from './application/ports/i-account-directory.repository.port';
import { VerifiedClientLister } from './application/verified-client-lister';
import { TypeOrmAccountDirectoryRepository } from './infrastructure/persistence/typeorm-account-directory.repository';

/**
 * Fachadas de lectura de `identity` para `billing` (spec 009, decisión 2): `VerifiedClientLister` (conciliación, en el
 * `worker`) y `AccountContactReader` (correo del comprobante, en el `api`). No exporta repositorios ni entidades.
 * `IdentityModule` no sirve aquí: necesita el entorno y trae sesiones, JWT y *throttlers*.
 */
@Module({
  providers: [
    { provide: I_ACCOUNT_DIRECTORY_REPOSITORY, useClass: TypeOrmAccountDirectoryRepository },
    VerifiedClientLister,
    AccountContactReader,
  ],
  exports: [VerifiedClientLister, AccountContactReader],
})
export class IdentityReadersModule {}
