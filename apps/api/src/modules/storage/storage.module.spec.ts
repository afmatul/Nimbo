import type { Provider, ValueProvider } from '@nestjs/common';

import { AuditModule } from '../audit';

import { FILE_SERVICE_CONFIG } from './application/file-service-config';
import { I_PLAN_LIMITS_PROVIDER } from './application/plan-limits';
import { UPLOAD_CONFIG } from './application/upload-config';
import { FilesController } from './presentation/files.controller';
import { UploadsController } from './presentation/uploads.controller';
import { StorageModule } from './storage.module';

const ENV = {
  MINIO_PUBLIC_ENDPOINT: 'http://localhost:9000',
  UPLOAD_PART_SIZE_BYTES: 8_388_608,
  UPLOAD_MULTIPART_THRESHOLD_BYTES: 16_777_216,
  UPLOAD_URL_TTL_SECONDS: 3600,
  RATE_LIMIT_UPLOAD_INIT_PER_MINUTE: 300,
  RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE: 120,
};

const tokenOf = (provider: Provider): unknown =>
  typeof provider === 'function' ? provider : provider.provide;

function valueOf(providers: readonly Provider[], token: symbol): unknown {
  const found = providers.find((provider) => tokenOf(provider) === token) as
    ValueProvider | undefined;
  return found?.useValue;
}

describe('StorageModule', () => {
  const module = StorageModule.forRoot(ENV);
  const providers = module.providers ?? [];

  it('CA-2: publica la configuración de carga del entorno con los bytes como `bigint`', () => {
    expect(valueOf(providers, UPLOAD_CONFIG)).toEqual({
      partSizeBytes: 8_388_608n,
      multipartThresholdBytes: 16_777_216n,
      urlTtlSeconds: 3600,
      initPerMinute: 300,
    });
    expect(valueOf(providers, FILE_SERVICE_CONFIG)).toEqual({ downloadUrlPerMinute: 120 });
  });

  it('RN-1: no enlaza `I_PLAN_LIMITS_PROVIDER` (lo hace la raíz de composición) e importa la auditoría', () => {
    expect(providers.map(tokenOf)).not.toContain(I_PLAN_LIMITS_PROVIDER);
    expect(module.imports).toEqual([AuditModule]);
  });

  it('CA-17: monta los controladores de cargas y archivos', () => {
    expect(module.controllers).toEqual([UploadsController, FilesController]);
  });
});
