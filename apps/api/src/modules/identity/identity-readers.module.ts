import { Module } from '@nestjs/common';

import { AccountContactReader } from './application/account-contact-reader';
import { PendingPlanRegistry } from './application/pending-plan-registry';
import { I_ACCOUNT_DIRECTORY_REPOSITORY } from './application/ports/i-account-directory.repository.port';
import { I_USER_REPOSITORY } from './application/ports/i-user-repository.port';
import { VerifiedClientLister } from './application/verified-client-lister';
import { TypeOrmAccountDirectoryRepository } from './infrastructure/persistence/typeorm-account-directory.repository';
import { TypeormUserRepository } from './infrastructure/persistence/typeorm-user.repository';

/**
 * Fachadas de `identity` para `billing` (spec 009, decisión 2): `VerifiedClientLister` (conciliación, en el `worker`),
 * `AccountContactReader` (correo del comprobante, en el `api`) y `PendingPlanRegistry` (descarta el plan elegido al
 * registrarse, la única escritura). No exporta repositorios ni entidades.
 * `IdentityModule` no sirve aquí: necesita el entorno y trae sesiones, JWT y *throttlers*.
 */
@Module({
  providers: [
    { provide: I_ACCOUNT_DIRECTORY_REPOSITORY, useClass: TypeOrmAccountDirectoryRepository },
    { provide: I_USER_REPOSITORY, useClass: TypeormUserRepository },
    VerifiedClientLister,
    AccountContactReader,
    PendingPlanRegistry,
  ],
  exports: [VerifiedClientLister, AccountContactReader, PendingPlanRegistry],
})
export class IdentityReadersModule {}
