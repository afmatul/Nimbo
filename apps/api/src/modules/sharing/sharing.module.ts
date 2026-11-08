import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import type { Env, LockoutPolicy } from '../../shared';
import { AccessModule } from '../access';
import { AuditModule } from '../audit';

import { I_PUBLIC_LINK_RESOLVER } from './application/ports/i-public-link-resolver.port';
import { I_PUBLIC_LINK_REPOSITORY } from './application/ports/i-public-link.repository.port';
import { I_SHARE_REPOSITORY } from './application/ports/i-share.repository.port';
import { PublicLinkAccessService } from './application/public-link-access.service';
import { PublicLinkPasswordGate } from './application/public-link-password-gate';
import { PublicLinkService } from './application/public-link.service';
import { ReceivedSharesService } from './application/received-shares.service';
import { publicLinkCeilingOf, SHARING_CONFIG } from './application/sharing-config';
import type { SharingConfig } from './application/sharing-config';
import { SharingService } from './application/sharing.service';
import { SqlPublicLinkResolver } from './infrastructure/persistence/sql-public-link-resolver';
import { TypeOrmPublicLinkRepository } from './infrastructure/persistence/typeorm-public-link.repository';
import { TypeOrmShareRepository } from './infrastructure/persistence/typeorm-share.repository';
import { PublicLinkAccessController } from './presentation/public-link-access.controller';
import { PublicLinksController } from './presentation/public-links.controller';
import { ReceivedSharesController } from './presentation/received-shares.controller';
import { SharingController } from './presentation/sharing.controller';

/** Variables del `api` que `sharing` usa (planes 012 y 013 §2). */
export type SharingEnv = Pick<
  Env,
  | 'SHARING_RATE_LIMIT_PER_MINUTE'
  | 'WEB_PUBLIC_URL'
  | 'PUBLIC_LINK_RATE_LIMIT_PER_MINUTE'
  | 'PUBLIC_LINK_MAX_FAILURES'
  | 'PUBLIC_LINK_FAILURE_WINDOW_MINUTES'
  | 'PUBLIC_LINK_LOCK_MINUTES'
  | 'PUBLIC_LINK_GLOBAL_MAX_FAILURES_PER_HOUR'
>;

const SECONDS_PER_MINUTE = 60;

/** 013 CA-13, S-1: el bloqueo por enlace + red con los minutos del entorno pasados a segundos. */
const publicLinkLockoutOf = (env: SharingEnv): LockoutPolicy => ({
  maxFailures: env.PUBLIC_LINK_MAX_FAILURES,
  windowSeconds: env.PUBLIC_LINK_FAILURE_WINDOW_MINUTES * SECONDS_PER_MINUTE,
  lockSeconds: env.PUBLIC_LINK_LOCK_MINUTES * SECONDS_PER_MINUTE,
});

/**
 * Módulo `sharing` (M3b, planes 012 y 013 §2). `forRoot(env, storage)` recibe **la misma** instancia de `StorageModule`
 * que la raíz (aporta `WritableAccountPolicy`, PD-121, y `LinkedFileGateway`, 013). `I_SHAREE_DIRECTORY` lo enlaza la
 * raíz (`ShareeDirectoryBindingModule`, global; DF-84); `SharedModule` (global) aporta transacciones, reloj, el límite
 * de tasa, el hasher de contraseñas y el bloqueo por intentos (013 D-2).
 */
@Module({})
export class SharingModule {
  static forRoot(env: SharingEnv, storage: DynamicModule): DynamicModule {
    const config: SharingConfig = {
      shareAttemptsPerMinute: env.SHARING_RATE_LIMIT_PER_MINUTE,
      webPublicUrl: env.WEB_PUBLIC_URL,
      publicLinkRequestsPerMinute: env.PUBLIC_LINK_RATE_LIMIT_PER_MINUTE,
      publicLinkLockout: publicLinkLockoutOf(env),
      publicLinkCeiling: publicLinkCeilingOf(env.PUBLIC_LINK_GLOBAL_MAX_FAILURES_PER_HOUR),
    };
    return {
      module: SharingModule,
      imports: [storage, AccessModule, AuditModule],
      controllers: [
        SharingController,
        ReceivedSharesController,
        PublicLinksController,
        PublicLinkAccessController,
      ],
      providers: [
        { provide: SHARING_CONFIG, useValue: config },
        { provide: I_SHARE_REPOSITORY, useClass: TypeOrmShareRepository },
        { provide: I_PUBLIC_LINK_REPOSITORY, useClass: TypeOrmPublicLinkRepository },
        { provide: I_PUBLIC_LINK_RESOLVER, useClass: SqlPublicLinkResolver },
        SharingService,
        ReceivedSharesService,
        PublicLinkService,
        PublicLinkPasswordGate,
        PublicLinkAccessService,
      ],
    };
  }
}
