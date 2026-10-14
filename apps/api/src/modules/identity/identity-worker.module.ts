import { Module } from '@nestjs/common';

import { I_ACCOUNT_DIRECTORY_REPOSITORY } from './application/ports/i-account-directory.repository.port';
import { VerifiedClientLister } from './application/verified-client-lister';
import { TypeOrmAccountDirectoryRepository } from './infrastructure/persistence/typeorm-account-directory.repository';

/**
 * Parte de `identity` que corre en el `worker` (009 CA-2): solo la fachada que lista clientes verificados para la
 * conciliación de `billing`. `IdentityModule` no entra al `worker` (sesiones, JWT y *throttlers* son del `api`).
 */
@Module({
  providers: [
    { provide: I_ACCOUNT_DIRECTORY_REPOSITORY, useClass: TypeOrmAccountDirectoryRepository },
    VerifiedClientLister,
  ],
  exports: [VerifiedClientLister],
})
export class IdentityWorkerModule {}
