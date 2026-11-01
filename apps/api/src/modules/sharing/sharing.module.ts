import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import type { Env } from '../../shared';
import { AccessModule } from '../access';
import { AuditModule } from '../audit';

import { I_PUBLIC_LINK_REPOSITORY } from './application/ports/i-public-link.repository.port';
import { I_SHARE_REPOSITORY } from './application/ports/i-share.repository.port';
import { PublicLinkService } from './application/public-link.service';
import { ReceivedSharesService } from './application/received-shares.service';
import { SHARING_CONFIG } from './application/sharing-config';
import type { SharingConfig } from './application/sharing-config';
import { SharingService } from './application/sharing.service';
import { TypeOrmPublicLinkRepository } from './infrastructure/persistence/typeorm-public-link.repository';
import { TypeOrmShareRepository } from './infrastructure/persistence/typeorm-share.repository';
import { PublicLinksController } from './presentation/public-links.controller';
import { ReceivedSharesController } from './presentation/received-shares.controller';
import { SharingController } from './presentation/sharing.controller';

/** Variables del `api` que `sharing` usa (planes 012 y 013 §2). */
export type SharingEnv = Pick<Env, 'SHARING_RATE_LIMIT_PER_MINUTE' | 'WEB_PUBLIC_URL'>;

/**
 * Módulo `sharing` (M3b, planes 012 y 013 §2). `forRoot(env, storage)` recibe **la misma** instancia de `StorageModule`
 * que la raíz (aporta `WritableAccountPolicy`, PD-121, y `LinkedFileGateway`, 013). `I_SHAREE_DIRECTORY` lo enlaza la
 * raíz (`ShareeDirectoryBindingModule`, global; DF-84); `SharedModule` (global) aporta transacciones, reloj, el límite
 * de tasa y el hasher de contraseñas (013 D-2).
 */
@Module({})
export class SharingModule {
  static forRoot(env: SharingEnv, storage: DynamicModule): DynamicModule {
    const config: SharingConfig = {
      shareAttemptsPerMinute: env.SHARING_RATE_LIMIT_PER_MINUTE,
      webPublicUrl: env.WEB_PUBLIC_URL,
    };
    return {
      module: SharingModule,
      imports: [storage, AccessModule, AuditModule],
      controllers: [SharingController, ReceivedSharesController, PublicLinksController],
      providers: [
        { provide: SHARING_CONFIG, useValue: config },
        { provide: I_SHARE_REPOSITORY, useClass: TypeOrmShareRepository },
        { provide: I_PUBLIC_LINK_REPOSITORY, useClass: TypeOrmPublicLinkRepository },
        SharingService,
        ReceivedSharesService,
        PublicLinkService,
      ],
    };
  }
}
