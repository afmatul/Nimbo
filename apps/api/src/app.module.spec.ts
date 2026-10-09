import { AppModule } from './app.module';
import { StorageModule } from './modules/storage';
import { PreviewModule } from './modules/storage/preview';
import { apiEnvSchema } from './shared';

const ENV = apiEnvSchema.parse({
  NODE_ENV: 'test',
  APP_ENV: 'test',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgres://nimbo_app:prueba@localhost/nimbo',
  REDIS_URL: 'redis://localhost:6379',
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'prueba',
  MINIO_SECRET_KEY: 'prueba',
  WEB_PUBLIC_URL: 'http://localhost:3002',
  CORS_ORIGIN: 'http://localhost:3002',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  RATE_LIMIT_PREVIEW_URL_PER_MINUTE: '7',
});

describe('AppModule: composición de preview (017)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('CA-11, CA-12: crea storage una sola vez y pasa el mismo descriptor y la tasa de env a preview', () => {
    const storage = jest.spyOn(StorageModule, 'forRoot');
    const preview = jest.spyOn(PreviewModule, 'register');

    const app = AppModule.forRoot(ENV);
    const storageModule = storage.mock.results[0]?.value as ReturnType<
      typeof StorageModule.forRoot
    >;

    expect(storage).toHaveBeenCalledTimes(1);
    expect(storage).toHaveBeenCalledWith(ENV);
    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview.mock.calls[0]?.[0].storageModule).toBe(storageModule);
    expect(preview.mock.calls[0]?.[0].config).toEqual({ previewUrlPerMinute: 7 });
    expect(app.imports).toContain(preview.mock.results[0]?.value);
    expect(app.imports).not.toContain(storageModule);
    expect(storageModule.imports).not.toContain(PreviewModule);
  });
});
