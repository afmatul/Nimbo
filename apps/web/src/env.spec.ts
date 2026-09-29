import { loadWebEnv } from './env';

const VALID = {
  APP_ENV: 'test',
  API_INTERNAL_URL: 'http://localhost:3000',
  API_PUBLIC_URL: 'http://localhost/api/v1',
};

describe('loadWebEnv', () => {
  it('CA-20: falta `API_PUBLIC_URL` → issue que nombra la variable', () => {
    const result = loadWebEnv({ APP_ENV: 'test', API_INTERNAL_URL: 'http://localhost:3000' });

    expect(result).toEqual({ ok: false, issues: ['`API_PUBLIC_URL` es obligatoria'] });
  });

  it('CA-20: `http://` con `APP_ENV=staging` falla', () => {
    const result = loadWebEnv({ ...VALID, APP_ENV: 'staging' });

    expect(result).toEqual({
      ok: false,
      issues: ['`API_PUBLIC_URL` debe usar https en staging y en producción'],
    });
  });

  it('CA-20: `https://` con `APP_ENV=staging` es válido', () => {
    const result = loadWebEnv({
      ...VALID,
      APP_ENV: 'staging',
      API_PUBLIC_URL: 'https://api.staging.nimbo.me/api/v1',
    });

    expect(result.ok).toBe(true);
  });

  it('CA-18: falta `API_INTERNAL_URL` → issue que nombra la variable y el motivo', () => {
    const result = loadWebEnv({ APP_ENV: 'test', API_PUBLIC_URL: VALID.API_PUBLIC_URL });

    expect(result).toEqual({ ok: false, issues: ['`API_INTERNAL_URL` es obligatoria'] });
  });

  it('CA-18: `PORT=abc` → «`PORT` debe ser un entero entre 1 y 65535»', () => {
    const result = loadWebEnv({ ...VALID, PORT: 'abc' });

    expect(result).toEqual({ ok: false, issues: ['`PORT` debe ser un entero entre 1 y 65535'] });
  });

  it('CA-18: varios errores → todos en una lista y sin valores', () => {
    const result = loadWebEnv({
      APP_ENV: 'prod-secreto',
      API_INTERNAL_URL: 'no-es-url',
      API_PUBLIC_URL: VALID.API_PUBLIC_URL,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(2);
    expect(result.issues.join('\n')).not.toContain('prod-secreto');
    expect(result.issues.join('\n')).not.toContain('no-es-url');
  });

  it('CA-18: entorno válido → `env` tipado con `PORT` 3002 por defecto', () => {
    const result = loadWebEnv(VALID);

    expect(result).toEqual({
      ok: true,
      env: {
        APP_ENV: 'test',
        API_INTERNAL_URL: 'http://localhost:3000',
        API_PUBLIC_URL: 'http://localhost/api/v1',
        PORT: 3002,
      },
    });
  });

  it('CA-29: ninguna variable del esquema usa el prefijo `NEXT_PUBLIC_`', () => {
    const result = loadWebEnv(VALID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.env).some((key) => key.startsWith('NEXT_PUBLIC_'))).toBe(false);
  });
});
