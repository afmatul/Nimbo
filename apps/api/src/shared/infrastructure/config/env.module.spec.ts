import { Test } from '@nestjs/testing';

import { ENV, EnvModule } from './env.module';
import type { SharedEnvBase } from './env.schema';

const ENV_VALUE: SharedEnvBase = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  APP_VERSION: 'test',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgres://nimbo:nimbo@localhost:5432/nimbo',
  REDIS_URL: 'redis://localhost:6379',
};

describe('EnvModule.forRoot', () => {
  it('CA-18: provee bajo `ENV` exactamente el entorno que la raíz de composición ya validó', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EnvModule.forRoot(ENV_VALUE)],
    }).compile();

    expect(moduleRef.get(ENV)).toBe(ENV_VALUE);
  });

  it('CA-10: no lee `process.env`: el entorno llega por parámetro y no se vuelve a validar', async () => {
    const reads: string[] = [];
    const original = process.env;
    process.env = new Proxy(original, {
      get: (target, key): string | undefined => {
        if (typeof key === 'string') reads.push(key);
        return target[key as string];
      },
    });

    try {
      const moduleRef = await Test.createTestingModule({
        imports: [EnvModule.forRoot(ENV_VALUE)],
      }).compile();

      expect(moduleRef.get(ENV)).toBe(ENV_VALUE);
    } finally {
      process.env = original;
    }

    expect(reads.filter((key) => key in ENV_VALUE)).toEqual([]);
  });

  it('CA-18: es global: un módulo que no lo importa también resuelve `ENV`', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EnvModule.forRoot(ENV_VALUE)],
      providers: [
        { provide: 'CONSUMIDOR', useFactory: (env: SharedEnvBase) => env, inject: [ENV] },
      ],
    }).compile();

    expect(moduleRef.get('CONSUMIDOR')).toBe(ENV_VALUE);
  });
});
