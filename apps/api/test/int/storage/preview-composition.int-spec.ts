import { Injectable, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import type { Module as NestModule } from '@nestjs/core/injector/module';

import {
  I_PLAN_LIMITS_PROVIDER,
  StorageModule,
  StoragePreviewFacade,
} from '../../../src/modules/storage';
import { AccessibleFileUrlIssuer } from '../../../src/modules/storage/application/accessible-file-url-issuer';
import { FileService } from '../../../src/modules/storage/application/file.service';
import { PlanLimitsBindingModule } from '../../../src/plan-limits-binding.module';
import { FakePlanLimitsProvider } from '../../support/fake-plan-limits.provider';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

import { DEFAULT_TEST_LIMITS } from './storage-http';

/** Consumidor de la fachada, como lo será `PreviewService` (T-03): solo ve lo que `StorageModule` exporta. */
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
      modules: [PlanLimitsBindingModule, storageModule, ConsumerModule.register(storageModule)],
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

  it('CA-11: `storage` exporta solo la fachada; el emisor interno sigue sirviendo a la descarga de 005', () => {
    const [storageModule] = instancesOf(StorageModule);

    expect([...(storageModule?.exports ?? [])]).toEqual([StoragePreviewFacade]);
    expect(storageModule?.providers.has(AccessibleFileUrlIssuer)).toBe(true);
    expect(testApp.app.get(FileService)).toBeInstanceOf(FileService);
  });
});
