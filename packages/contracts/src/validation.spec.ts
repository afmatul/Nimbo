import { z } from 'zod';

import { toFieldIssues } from './validation';

function issuesOf(schema: z.ZodTypeAny, input: unknown): ReturnType<typeof toFieldIssues> {
  const result = schema.safeParse(input);
  if (result.success) {
    throw new Error('Se esperaba un error de validación');
  }
  return toFieldIssues(result.error);
}

describe('toFieldIssues', () => {
  it('CA-6: toma `reason` de `params.reason` del issue y conserva su mensaje', () => {
    const schema = z.object({
      name: z.string().refine((value) => value.length <= 3, {
        message: 'Usa como máximo 3 caracteres.',
        params: { reason: 'TOO_LONG' },
      }),
    });

    expect(issuesOf(schema, { name: 'abcd' })).toEqual([
      { field: 'name', reason: 'TOO_LONG', message: 'Usa como máximo 3 caracteres.' },
    ]);
  });

  it('CA-6: sin `params.reason`, un campo ausente produce `REQUIRED`', () => {
    const schema = z.object({ name: z.string() });

    expect(issuesOf(schema, {})).toEqual([
      expect.objectContaining({ field: 'name', reason: 'REQUIRED' }),
    ]);
  });

  it('CA-6: sin `params.reason`, cualquier otro issue produce `INVALID`', () => {
    const schema = z.object({ age: z.number() });

    expect(issuesOf(schema, { age: 'diez' })).toEqual([
      expect.objectContaining({ field: 'age', reason: 'INVALID' }),
    ]);
  });

  it('CA-6: `field` es la ruta del issue unida con `.`', () => {
    const schema = z.object({ profile: z.object({ items: z.array(z.string()) }) });

    expect(issuesOf(schema, { profile: { items: [1] } })).toEqual([
      expect.objectContaining({ field: 'profile.items.0', reason: 'INVALID' }),
    ]);
  });

  it('CA-7: `unrecognized_keys` produce un elemento por clave con `UNKNOWN_FIELD`', () => {
    const schema = z.object({ name: z.string() }).strict('Este campo no se admite.');

    expect(issuesOf(schema, { name: 'a', rol: 'ADMIN', plan: 'x' })).toEqual([
      { field: 'rol', reason: 'UNKNOWN_FIELD', message: 'Este campo no se admite.' },
      { field: 'plan', reason: 'UNKNOWN_FIELD', message: 'Este campo no se admite.' },
    ]);
  });

  it('CA-7: una clave desconocida anidada lleva la ruta del objeto', () => {
    const schema = z.object({ profile: z.object({ name: z.string() }).strict() });

    expect(issuesOf(schema, { profile: { name: 'a', role: 'x' } })).toEqual([
      expect.objectContaining({ field: 'profile.role', reason: 'UNKNOWN_FIELD' }),
    ]);
  });

  it('CA-5: devuelve todos los issues, en orden', () => {
    const schema = z.object({ a: z.string(), b: z.string() });

    expect(issuesOf(schema, {}).map((issue) => issue.field)).toEqual(['a', 'b']);
  });
});
