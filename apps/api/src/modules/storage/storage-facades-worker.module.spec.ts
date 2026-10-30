import { processorQueuesOf, validWorkerEnv } from '../../../test/support/processor-queues';
import { AuditModule } from '../audit';

import { FileVersionService } from './application/file-version.service';
import { OptimizableFileGateway } from './application/optimizable-file.gateway';
import { QuotaService } from './application/quota.service';
import { UPLOAD_CONFIG } from './application/upload-config';
import { UploadService } from './application/upload.service';
import { StorageFacadesWorkerModule } from './storage-facades-worker.module';
import { StorageWorkerModule } from './storage-worker.module';

describe('StorageFacadesWorkerModule (ADR-0038)', () => {
  it('no registra procesadores ni colas: el proceso que lo importa no consume `upload-cleanup`, `trash-purge` ni `usage-reconcile`', () => {
    const module = StorageFacadesWorkerModule.forRoot();

    expect(processorQueuesOf(module)).toEqual([]);
    // Solo `AuditModule`: ningún `BullModule.registerQueue` ni otro módulo con procesadores.
    expect(module.imports).toEqual([AuditModule]);
  });

  it('M-1: registra la escritura de versiones, pero no el ciclo de carga (`UploadService`, `QuotaService`, `UPLOAD_CONFIG`)', () => {
    const tokens = (StorageFacadesWorkerModule.forRoot().providers ?? []).map((provider) =>
      typeof provider === 'function' ? provider : provider.provide,
    );

    expect(tokens).toContain(FileVersionService);
    expect(tokens).not.toEqual(expect.arrayContaining([UploadService]));
    expect(tokens).not.toEqual(expect.arrayContaining([QuotaService]));
    expect(tokens).not.toEqual(expect.arrayContaining([UPLOAD_CONFIG]));
  });

  it('exporta la fachada del optimizador', () => {
    expect(StorageFacadesWorkerModule.forRoot().exports).toEqual([OptimizableFileGateway]);
  });

  it('`StorageWorkerModule` conserva sus tres procesadores de mantenimiento', () => {
    expect(processorQueuesOf(StorageWorkerModule.forRoot(validWorkerEnv())).sort()).toEqual([
      'trash-purge',
      'upload-cleanup',
      'usage-reconcile',
    ]);
  });
});
