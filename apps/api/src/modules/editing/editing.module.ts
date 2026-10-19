import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';

import { I_CLOCK } from '../../shared';
import type { Env, IClock } from '../../shared';
import { AccessModule } from '../access';
import { AuditModule } from '../audit';

import { CONTENT_LINK_SIGNER, ContentLinkSigner } from './application/content-link.signer';
import { DocumentContentService } from './application/document-content.service';
import { EditSessionService } from './application/edit-session.service';
import { EDITING_CONFIG } from './application/editing-config';
import type { EditingConfig, OnlyOfficeConnection } from './application/editing-config';
import { EditorAvailability } from './application/editor-availability';
import { I_DOCUMENT_EDITOR } from './application/ports/i-document-editor.port';
import { I_EDIT_SESSION_REPOSITORY } from './application/ports/i-edit-session.repository.port';
import { I_INDEX_QUEUE } from './application/ports/i-index-queue.port';
import { I_SAVE_VERSION_QUEUE } from './application/ports/i-save-version-queue.port';
import { PresenceService } from './application/presence.service';
import { SaveCallbackHandler } from './application/save-callback.handler';
import { SaveFailedNotifier } from './application/save-failed-notifier';
import { SaveVersionService } from './application/save-version.service';
import { INDEX_QUEUE, IndexQueue } from './infrastructure/index.queue';
import { OnlyOfficeEditor } from './infrastructure/onlyoffice-editor';
import { TypeOrmEditSessionRepository } from './infrastructure/persistence/typeorm-edit-session.repository';
import { SaveVersionProcessor } from './infrastructure/save-version.processor';
import { SAVE_VERSION_QUEUE, SaveVersionQueue } from './infrastructure/save-version.queue';
import { EditorController } from './presentation/editor.controller';
import { OnlyOfficeController } from './presentation/onlyoffice.controller';

/** Variables del `api` que `editing` usa (plan §5); todas opcionales salvo el tope, que tiene valor por defecto. */
export type EditingEnv = Pick<
  Env,
  | 'ONLYOFFICE_JWT_SECRET'
  | 'ONLYOFFICE_PUBLIC_URL'
  | 'ONLYOFFICE_INTERNAL_URL'
  | 'EDITING_CALLBACK_BASE_URL'
  | 'EDITING_MAX_DOC_BYTES'
>;

/** Las cuatro variables o ninguna conexión: sin una de ellas, abrir responde `EDITING_UNAVAILABLE` (CA-15). */
const connectionFrom = (env: EditingEnv): OnlyOfficeConnection | null => {
  const jwtSecret = env.ONLYOFFICE_JWT_SECRET;
  const publicUrl = env.ONLYOFFICE_PUBLIC_URL;
  const internalUrl = env.ONLYOFFICE_INTERNAL_URL;
  const callbackBaseUrl = env.EDITING_CALLBACK_BASE_URL;
  if (!jwtSecret || !publicUrl || !internalUrl || !callbackBaseUrl) return null;
  return { jwtSecret, publicUrl, internalUrl, callbackBaseUrl };
};

/**
 * Módulos de la raíz que `editing` usa, con **la misma** instancia: `storage` da la fachada `EditableFileGateway`
 * (`StorageModule.forRoot(env)`) y `realtime` los puertos `IDocumentRooms` e `IRealtimePublisher`
 * (`RealtimeModule.forRoot(env, identity)`).
 */
export interface EditingDependencies {
  readonly storage: DynamicModule;
  readonly realtime: DynamicModule;
}

/**
 * Módulo `editing` (M5, plan 016 §2). `forRoot(env, { storage, realtime })` recibe las **mismas** instancias que la
 * raíz, como `realtime` con `identity`. `I_PLAN_LIMITS_PROVIDER` e `I_USER_DIRECTORY` los enlaza la raíz (globales);
 * `SharedModule` (global) aporta reloj y transacciones, y la raíz `EventEmitterModule.forRoot()` para
 * `realtime.document-left` (ADR-0019). Sin `billing` (DF-74, plan §2). Registra las colas `editing-save` (con su
 * procesador **en el `api`**, ADR-0029) e `indexing` (sin consumidor hasta 019).
 */
@Module({})
export class EditingModule {
  static forRoot(env: EditingEnv, { storage, realtime }: EditingDependencies): DynamicModule {
    const onlyOffice = connectionFrom(env);
    const config: EditingConfig = { onlyOffice, maxDocBytes: BigInt(env.EDITING_MAX_DOC_BYTES) };
    return {
      module: EditingModule,
      imports: [
        storage,
        realtime,
        AccessModule,
        AuditModule,
        JwtModule.register({}),
        BullModule.registerQueue({ name: SAVE_VERSION_QUEUE }, { name: INDEX_QUEUE }),
      ],
      controllers: [EditorController, OnlyOfficeController],
      providers: [
        { provide: EDITING_CONFIG, useValue: config },
        { provide: I_EDIT_SESSION_REPOSITORY, useClass: TypeOrmEditSessionRepository },
        {
          provide: I_DOCUMENT_EDITOR,
          inject: [JwtService],
          useFactory: (jwt: JwtService) => new OnlyOfficeEditor(jwt, onlyOffice),
        },
        {
          provide: CONTENT_LINK_SIGNER,
          inject: [JwtService, I_CLOCK],
          useFactory: (jwt: JwtService, clock: IClock) =>
            onlyOffice === null ? null : new ContentLinkSigner(jwt, clock, onlyOffice.jwtSecret),
        },
        EditorAvailability,
        PresenceService,
        EditSessionService,
        DocumentContentService,
        { provide: I_SAVE_VERSION_QUEUE, useClass: SaveVersionQueue },
        { provide: I_INDEX_QUEUE, useClass: IndexQueue },
        SaveFailedNotifier,
        SaveCallbackHandler,
        SaveVersionService,
        SaveVersionProcessor,
      ],
    };
  }
}
