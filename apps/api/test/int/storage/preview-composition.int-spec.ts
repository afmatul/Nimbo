import { randomUUID } from 'node:crypto';

import { Injectable, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import type { Module as NestModule } from '@nestjs/core/injector/module';

import { AppModule } from '../../../src/app.module';
import { ContentMatchBindingModule } from '../../../src/content-match-binding.module';
import { ExplorerBadgesBindingModule } from '../../../src/explorer-badges-binding.module';
import {
  I_PLAN_LIMITS_PROVIDER,
  StorageModule,
  StoragePreviewFacade,
} from '../../../src/modules/storage';
import { AccessibleFileUrlIssuer } from '../../../src/modules/storage/application/accessible-file-url-issuer';
import { FileService } from '../../../src/modules/storage/application/file.service';
import { NodeNotFoundError } from '../../../src/modules/storage/domain/errors';
import { PreviewModule } from '../../../src/modules/storage/preview';
import { PREVIEW_CONFIG } from '../../../src/modules/storage/preview/application/preview-config';
import { PreviewService } from '../../../src/modules/storage/preview/application/preview.service';
import { PlanLimitsBindingModule } from '../../../src/plan-limits-binding.module';
import { createActor, Role } from '../../../src/shared';
import { FakePlanLimitsProvider } from '../../support/fake-plan-limits.provider';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

import { DEFAULT_TEST_LIMITS } from './storage-http';

/** Consumidor adicional de la API pública de storage: solo ve lo que `StorageModule` exporta. */
@Injectable()
class FacadeConsumer {
  constructor(readonly facade: StoragePreviewFacade) {}
}

@Module({})
class ConsumerModule {
  static register(storageModule: DynamicModule): DynamicModule {
    return { module: ConsumerModule, imports: [storageModule], providers: [FacadeConsumer] };
  }
}

/**
 * Frontera pública y composición de la vista previa (017 plan §2.3, CA-11): con un único descriptor
 * `StorageModule.forRoot(env)` compartido, el consumidor recibe la misma instancia de la fachada que usa la app, y
 * el emisor interno de URLs no es visible fuera de `storage`.
 */
describe('composición de `StoragePreviewFacade` (017 plan §2.3)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    const env = buildTestEnv();
    const storageModule = StorageModule.forRoot(env);
    testApp = await createTestApp({
      validatedEnv: env,
      modules: [
        PlanLimitsBindingModule,
        ContentMatchBindingModule,
        ExplorerBadgesBindingModule,
        storageModule,
        ConsumerModule.register(storageModule),
      ],
      overrides: [
        {
          provide: I_PLAN_LIMITS_PROVIDER,
          useValue: new FakePlanLimitsProvider(DEFAULT_TEST_LIMITS),
        },
      ],
    });
  });

  afterAll(async () => {
    await testApp?.close();
  });

  /** Módulos de la app compilada cuya clase es `metatype` (una sola instancia si la composición es correcta). */
  const instancesOf = (metatype: unknown): NestModule[] =>
    [...testApp.app.get(ModulesContainer).values()].filter((m) => m.metatype === metatype);

  it('CA-11: el consumidor recibe la fachada exportada, única instancia en la app', () => {
    const consumer = testApp.app.get(FacadeConsumer);

    expect(consumer.facade).toBeInstanceOf(StoragePreviewFacade);
    expect(consumer.facade).toBe(testApp.app.get(StoragePreviewFacade));
    expect(instancesOf(StorageModule)).toHaveLength(1);
  });

  it('CA-11: `storage` exporta la fachada (no el emisor interno) y la descarga de 005 sigue resolviéndose', () => {
    const [storageModule] = instancesOf(StorageModule);
    const exported = [...(storageModule?.exports ?? [])];

    expect(exported).toContain(StoragePreviewFacade);
    expect(exported).not.toContain(AccessibleFileUrlIssuer);
    expect(storageModule?.providers.has(AccessibleFileUrlIssuer)).toBe(true);
    expect(testApp.app.get(FileService)).toBeInstanceOf(FileService);
  });
});

describe('composición real de AppModule y PreviewModule (017 T-03)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    const env = buildTestEnv({ RATE_LIMIT_PREVIEW_URL_PER_MINUTE: '7' });
    testApp = await createTestApp({
      modules: [AppModule.forRoot(env)],
      validatedEnv: env,
      accessTokenStrategy: 'identity',
    });
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await testApp?.close();
  });

  it('CA-11, CA-12: resuelve preview con una única instancia de storage y la configuración del entorno', async () => {
    const modules = [...testApp.app.get(ModulesContainer).values()];
    expect(modules.filter((module) => module.metatype === StorageModule)).toHaveLength(1);
    expect(modules.filter((module) => module.metatype === PreviewModule)).toHaveLength(1);
    expect(testApp.app.get(PREVIEW_CONFIG)).toEqual({ previewUrlPerMinute: 7 });
    const facade = testApp.app.get(StoragePreviewFacade);
    const facadeCall = jest.spyOn(facade, 'issueUrl');
    const actor = createActor(randomUUID(), Role.CLIENT);
    const fileId = randomUUID();

    await expect(testApp.app.get(PreviewService).issueUrl(actor, fileId)).rejects.toBeInstanceOf(
      NodeNotFoundError,
    );

    expect(facadeCall).toHaveBeenCalledWith(actor, fileId);
  });
});
