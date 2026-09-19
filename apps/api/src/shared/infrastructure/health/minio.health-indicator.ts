import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Inject, Injectable } from '@nestjs/common';
import type { HealthCheckName, HealthCheckStatus } from '@nimbo/contracts';

import type { IHealthIndicator } from '../../application/health/i-health-indicator.port';
import { ENV } from '../config/env.module';
import { hasMinioConfig } from '../config/resolve-shared-env';
import type { SharedEnv } from '../config/resolve-shared-env';

const REQUEST_TIMEOUT_MS = 1000;

/** `HeadBucket(MINIO_BUCKET)` con el SDK de S3 (`forcePathStyle` para MinIO). Solo lo registra `api`. */
@Injectable()
export class MinioHealthIndicator implements IHealthIndicator {
  readonly name: HealthCheckName = 'minio';
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ENV) env: SharedEnv) {
    if (!hasMinioConfig(env)) {
      throw new Error(
        'MinioHealthIndicator requiere `MINIO_*`: regístralo solo en procesos con ese contrato.',
      );
    }
    this.bucket = env.MINIO_BUCKET;
    this.client = new S3Client({
      endpoint: env.MINIO_ENDPOINT,
      region: env.MINIO_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: env.MINIO_ACCESS_KEY, secretAccessKey: env.MINIO_SECRET_KEY },
      maxAttempts: 1,
      requestHandler: { connectionTimeout: REQUEST_TIMEOUT_MS, requestTimeout: REQUEST_TIMEOUT_MS },
    });
  }

  async check(): Promise<HealthCheckStatus> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    return 'up';
  }
}
