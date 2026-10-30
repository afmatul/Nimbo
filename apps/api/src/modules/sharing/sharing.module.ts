import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import type { Env } from '../../shared';
import { AccessModule } from '../access';
import { AuditModule } from '../audit';

import { I_SHARE_REPOSITORY } from './application/ports/i-share.repository.port';
import { SHARING_CONFIG } from './application/sharing-config';
import type { SharingConfig } from './application/sharing-config';
import { SharingService } from './application/sharing.service';
import { TypeOrmShareRepository } from './infrastructure/persistence/typeorm-share.repository';
import { SharingController } from './presentation/sharing.controller';

/** Variables del `api` que `sharing` usa (plan 012 §2). */
export type SharingEnv = Pick<Env, 'SHARING_RATE_LIMIT_PER_MINUTE'>;

/**
 * Módulo `sharing` (M3b, plan 012 §2). `forRoot(env, storage)` recibe **la misma** instancia de `StorageModule` que la
 * raíz (aporta `WritableAccountPolicy`, PD-121). `I_SHAREE_DIRECTORY` lo enlaza la raíz (`ShareeDirectoryBindingModule`,
 * global; DF-84); `SharedModule` (global) aporta transacciones, reloj y el límite de tasa.
 */
@Module({})
export class SharingModule {
  static forRoot(env: SharingEnv, storage: DynamicModule): DynamicModule {
    const config: SharingConfig = { shareAttemptsPerMinute: env.SHARING_RATE_LIMIT_PER_MINUTE };
    return {
      module: SharingModule,
      imports: [storage, AccessModule, AuditModule],
      controllers: [SharingController],
      providers: [
        { provide: SHARING_CONFIG, useValue: config },
        { provide: I_SHARE_REPOSITORY, useClass: TypeOrmShareRepository },
        SharingService,
      ],
    };
  }
}
