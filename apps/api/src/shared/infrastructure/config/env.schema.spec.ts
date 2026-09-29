import { apiEnvObjectSchema, SECRET_KEYS, workerEnvObjectSchema } from './env.schema';

const declaredIn = (key: string): string[] =>
  [
    ['api', apiEnvObjectSchema.shape],
    ['worker', workerEnvObjectSchema.shape],
  ]
    .filter(([, shape]) => Object.hasOwn(shape as object, key))
    .map(([process]) => process as string);

describe('secretos por proceso (001 plan §6.10)', () => {
  it.each(SECRET_KEYS)('CA-18: la clave secreta `%s` se declara en `api` o en `worker`', (key) => {
    expect(declaredIn(key).length).toBeGreaterThan(0);
  });

  it('CA-18: un secreto que ningún proceso declara no pasa la comprobación', () => {
    expect(declaredIn('SECRETO_SIN_PROCESO')).toEqual([]);
  });

  it('CA-18: `SMTP_PASSWORD` es secreta y solo la declara el `worker`', () => {
    expect(SECRET_KEYS).toContain('SMTP_PASSWORD');
    expect(declaredIn('SMTP_PASSWORD')).toEqual(['worker']);
  });
});
