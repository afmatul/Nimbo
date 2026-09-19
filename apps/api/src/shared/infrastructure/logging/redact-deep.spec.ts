import { performance } from 'node:perf_hooks';

import { redactDeep } from './redact-deep';
import { REDACTED_FIELDS } from './redacted-fields';

/** Acceso tipado como `unknown` a una ruta del resultado, para no usar `any` en las aserciones. */
const at = (value: unknown, ...path: (string | number)[]): unknown =>
  path.reduce<unknown>((current, key) => (current as Record<string | number, unknown>)[key], value);

const SPEC_FIELDS = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'secret',
  'apiKey',
  'fileName',
  'nombre',
  'content',
  'prompt',
] as const;

/** Objeto anidado con los 13 campos de CA-15 repartidos en varios niveles, más cabecera y arreglos. */
const sensitivePayload = (): Record<string, unknown> => ({
  event: 'user.login',
  password: 'p4ss',
  user: {
    id: 'u-1',
    passwordHash: '$argon2id$…',
    session: { token: 'tkn', accessToken: 'acc', refreshToken: 'ref' },
  },
  headers: { authorization: 'Bearer abc', cookie: 'sid=1', 'x-correlation-id': 'corr-1' },
  integration: { secret: 's', apiKey: 'k' },
  file: { fileName: 'contrato.docx', nombre: 'contrato.docx', sizeBytes: 12n },
  agent: { content: 'texto del archivo', prompt: '¿qué dice?' },
  items: [{ token: 't1' }, { safe: 'ok', nested: [{ apiKey: 'k2' }] }],
});

describe('REDACTED_FIELDS', () => {
  it('CA-15: la lista única contiene los 13 campos de la spec y las claves secretas del entorno', () => {
    for (const field of SPEC_FIELDS) {
      expect(REDACTED_FIELDS.has(field.toLowerCase())).toBe(true);
    }
    expect(REDACTED_FIELDS.has('minio_secret_key')).toBe(true);
    expect(REDACTED_FIELDS.has('minio_access_key')).toBe(true);
  });
});

describe('redactDeep', () => {
  it('CA-15: reemplaza por `[REDACTED]` cada campo sensible en cualquier nivel y conserva el resto', () => {
    const result = redactDeep(sensitivePayload());

    expect(result).toEqual({
      event: 'user.login',
      password: '[REDACTED]',
      user: {
        id: 'u-1',
        passwordHash: '[REDACTED]',
        session: { token: '[REDACTED]', accessToken: '[REDACTED]', refreshToken: '[REDACTED]' },
      },
      headers: { authorization: '[REDACTED]', cookie: '[REDACTED]', 'x-correlation-id': 'corr-1' },
      integration: { secret: '[REDACTED]', apiKey: '[REDACTED]' },
      file: { fileName: '[REDACTED]', nombre: '[REDACTED]', sizeBytes: 12n },
      agent: { content: '[REDACTED]', prompt: '[REDACTED]' },
      items: [{ token: '[REDACTED]' }, { safe: 'ok', nested: [{ apiKey: '[REDACTED]' }] }],
    });
  });

  it('CA-15: no muta el objeto original', () => {
    const input = sensitivePayload();

    redactDeep(input);

    expect((input.user as Record<string, unknown>).passwordHash).toBe('$argon2id$…');
  });

  it('CA-15: compara nombres de campo sin distinguir mayúsculas', () => {
    const result = redactDeep({ PASSWORD: 'a', AccessToken: 'b', Nombre: 'c', ok: 'd' });

    expect(result).toEqual({
      PASSWORD: '[REDACTED]',
      AccessToken: '[REDACTED]',
      Nombre: '[REDACTED]',
      ok: 'd',
    });
  });

  it('CA-15: redacta también valores no textuales (objetos y arreglos bajo un campo sensible)', () => {
    const result = redactDeep({ token: { value: 'x' }, cookie: ['a', 'b'], secret: 42 });

    expect(result).toEqual({ token: '[REDACTED]', cookie: '[REDACTED]', secret: '[REDACTED]' });
  });

  it('CA-15: tolera ciclos sin desbordar la pila', () => {
    const node: Record<string, unknown> = { token: 't', name: 'n' };
    node.self = node;
    const input = { root: node, list: [node] };

    const result = redactDeep(input);

    expect(at(result, 'root', 'token')).toBe('[REDACTED]');
    expect(at(result, 'root', 'name')).toBe('n');
    expect(at(result, 'root', 'self')).toBe('[Circular]');
    expect(at(result, 'list', 0, 'token')).toBe('[REDACTED]');
  });

  it('CA-15: trunca a partir de la profundidad 17 y redacta hasta la 16', () => {
    const buildNested = (depth: number): Record<string, unknown> =>
      depth === 0 ? { token: 'deep', leaf: true } : { token: 'lvl', child: buildNested(depth - 1) };
    const input = buildNested(20);

    const result = redactDeep(input);

    let cursor: unknown = result;
    for (let level = 1; level <= 16; level += 1) {
      expect(at(cursor, 'token')).toBe('[REDACTED]');
      cursor = at(cursor, 'child');
    }
    expect(cursor).toBe('[TRUNCATED]');
  });

  it('CA-15: deja intactos los valores que no son objetos planos (Error, Date, Buffer, null, primitivos)', () => {
    const err = new Error('falló');
    const date = new Date('2026-09-15T12:00:00.000Z');
    const buffer = Buffer.from('abc');

    const result = redactDeep({ err, date, buffer, nothing: null, count: 3, flag: false });

    expect(at(result, 'err')).toBe(err);
    expect(at(result, 'date')).toBe(date);
    expect(at(result, 'buffer')).toBe(buffer);
    expect(at(result, 'nothing')).toBeNull();
    expect(at(result, 'count')).toBe(3);
    expect(at(result, 'flag')).toBe(false);
  });

  it('CA-15: devuelve primitivos y arreglos raíz tal cual (redactando su interior)', () => {
    expect(redactDeep('texto')).toBe('texto');
    expect(redactDeep(null)).toBeNull();
    expect(redactDeep([{ password: 'x' }, 1])).toEqual([{ password: '[REDACTED]' }, 1]);
  });

  it('CA-15: redactar un objeto de bitácora típico cuesta menos de 50 µs en promedio', () => {
    const input = sensitivePayload();
    const iterations = 2_000;
    redactDeep(input); // calentamiento del JIT

    const start = performance.now();
    for (let i = 0; i < iterations; i += 1) {
      redactDeep(input);
    }
    const averageMicroseconds = ((performance.now() - start) / iterations) * 1_000;

    expect(averageMicroseconds).toBeLessThan(50);
  });
});
