import { DataSource } from 'typeorm';

import { apiEnvSchema } from '../config/env.schema';

import { buildDataSourceOptions } from './data-source';

describe('buildDataSourceOptions', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it('CA-10: `synchronize` es `false` aunque el entorno pida lo contrario', () => {
    process.env.TYPEORM_SYNCHRONIZE = 'true';
    process.env.NODE_ENV = 'development';

    const options = buildDataSourceOptions({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' });

    expect(options.synchronize).toBe(false);
  });

  it('CA-11: la tabla de control es `migracion` y las migraciones/entidades se resuelven por glob', () => {
    const options = buildDataSourceOptions({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' });

    expect(options).toMatchObject({
      type: 'postgres',
      url: 'postgres://u:p@localhost:5432/db',
      migrationsTableName: 'migracion',
      logging: false,
    });
    expect(options.migrations).toEqual([
      expect.stringMatching(/migrations[\\/]\[0-9\]\*\.\{ts,js\}$/),
    ]);
    expect(options.entities).toEqual([
      expect.stringMatching(
        /modules[\\/]\*\*[\\/]infrastructure[\\/]persistence[\\/]\*\.orm-entity\.\{ts,js\}$/,
      ),
    ]);
  });

  it('CA-10: importar `shared/index.ts` no lee `process.env` ni construye un `DataSource`', async () => {
    jest.resetModules();
    const reads: string[] = [];
    const spiedEnv = new Proxy(process.env, {
      get: (target, key): string | undefined => {
        if (typeof key === 'string') reads.push(key);
        return target[key as string];
      },
    });
    process.env = spiedEnv;
    const dataSourceConstructor = jest.fn();
    jest.doMock('typeorm', () => ({
      ...jest.requireActual('typeorm'),
      DataSource: dataSourceConstructor,
    }));

    const shared = jest.requireActual<Record<string, unknown>>('../../index');

    expect(shared).toHaveProperty('buildDataSourceOptions');
    // Librerías de terceros leen variables convencionales de Node (`NODE_ENV`, `NO_COLOR`) al cargarse;
    // lo prohibido es que `shared` lea la configuración de Nimbo antes del arranque.
    const NODE_CONVENTIONAL = new Set(['NODE_ENV']);
    const configurationReads = reads.filter(
      (key) => key in apiEnvSchema.shape && !NODE_CONVENTIONAL.has(key),
    );
    expect(configurationReads).toEqual([]);
    expect(dataSourceConstructor).not.toHaveBeenCalled();
    expect(DataSource).toBeDefined();
  });
});
