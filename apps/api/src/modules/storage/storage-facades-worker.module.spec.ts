import { processorQueuesOf, validWorkerEnv } from '../../../test/support/processor-queues';
import { AuditModule } from '../audit';

import { OptimizableFileGateway } from './application/optimizable-file.gateway';
import { StorageFacadesWorkerModule } from './storage-facades-worker.module';
import { StorageWorkerModule } from './storage-worker.module';

describe('StorageFacadesWorkerModule (ADR-0037)', () => {
  it('no registra procesadores ni colas: el proceso que lo importa no consume `upload-cleanup`, `trash-purge` ni `usage-reconcile`', () => {
    const module = StorageFacadesWorkerModule.forRoot();

    expect(processorQueuesOf(module)).toEqual([]);
    // Solo `AuditModule`: ningún `BullModule.registerQueue` ni otro módulo con procesadores.
    expect(module.imports).toEqual([AuditModule]);
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
