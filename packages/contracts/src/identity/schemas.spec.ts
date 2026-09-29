import type { z } from 'zod';

import { toFieldIssues } from '../validation';

import { IDENTITY_FIELD_MESSAGES } from './error-codes';
import {
  acceptedResponseSchema,
  registerRequestSchema,
  resendVerificationRequestSchema,
  verifyEmailRequestSchema,
  verifyEmailResponseSchema,
} from './schemas';

const VALID_REGISTRATION = {
  fullName: 'Ana López',
  email: 'ana@nimbo.me',
  password: 'Nimbo-Seguro-2026',
  acceptTerms: true,
};

type Issue = ReturnType<typeof toFieldIssues>[number];

function issuesOf(schema: z.ZodTypeAny, input: unknown): Issue[] {
  const result = schema.safeParse(input);
  return result.success ? [] : toFieldIssues(result.error);
}

function reasonsOf(schema: z.ZodTypeAny, input: unknown): string[] {
  return issuesOf(schema, input).map((issue) => `${issue.field}:${issue.reason}`);
}

describe('registerRequestSchema', () => {
  it('CA-6: acepta un registro válido', () => {
    expect(registerRequestSchema.parse(VALID_REGISTRATION)).toEqual(VALID_REGISTRATION);
  });

  it('CA-6: acepta un correo con espacios y mayúsculas (lo normaliza el servicio, D-16)', () => {
    expect(
      reasonsOf(registerRequestSchema, { ...VALID_REGISTRATION, email: '  Ana@Ejemplo.COM ' }),
    ).toEqual([]);
  });

  it.each([
    ['vacío', ''],
    ['solo espacios', '    '],
  ])('CA-6: un nombre %s es `REQUIRED`', (_label, fullName) => {
    expect(reasonsOf(registerRequestSchema, { ...VALID_REGISTRATION, fullName })).toEqual([
      'fullName:REQUIRED',
    ]);
  });

  it('CA-6: un nombre de 100 caracteres es válido y uno de 101 es `TOO_LONG`', () => {
    expect(
      reasonsOf(registerRequestSchema, { ...VALID_REGISTRATION, fullName: 'a'.repeat(100) }),
    ).toEqual([]);
    expect(
      reasonsOf(registerRequestSchema, { ...VALID_REGISTRATION, fullName: 'a'.repeat(101) }),
    ).toEqual(['fullName:TOO_LONG']);
  });

  it.each(['ana', 'ana@', '@nimbo.me', 'ana@nimbo', `${'a'.repeat(250)}@nimbo.me`])(
    'CA-6: el correo «%s» es `INVALID_EMAIL`',
    (email) => {
      expect(reasonsOf(registerRequestSchema, { ...VALID_REGISTRATION, email })).toEqual([
        'email:INVALID_EMAIL',
      ]);
    },
  );

  it.each([
    ['falso', { acceptTerms: false }],
    ['ausente', { acceptTerms: undefined }],
  ])('CA-6: `acceptTerms` %s es `TERMS_NOT_ACCEPTED` con el mensaje de spec §11', (_l, patch) => {
    expect(issuesOf(registerRequestSchema, { ...VALID_REGISTRATION, ...patch })).toEqual([
      {
        field: 'acceptTerms',
        reason: 'TERMS_NOT_ACCEPTED',
        message: 'Para crear tu cuenta, acepta los Términos y la Política de privacidad.',
      },
    ]);
  });

  it('CA-6: un campo ausente es `REQUIRED`', () => {
    const { fullName: _omitted, ...withoutName } = VALID_REGISTRATION;

    expect(reasonsOf(registerRequestSchema, withoutName)).toEqual(['fullName:REQUIRED']);
  });

  it('CA-6: un campo con otro tipo es `REQUIRED`', () => {
    expect(reasonsOf(registerRequestSchema, { ...VALID_REGISTRATION, email: 42 })).toEqual([
      'email:REQUIRED',
    ]);
  });

  it('CA-5: cada regla de contraseña incumplida es un issue propio con su `reason`', () => {
    expect(reasonsOf(registerRequestSchema, { ...VALID_REGISTRATION, password: 'corta' })).toEqual([
      'password:PASSWORD_TOO_SHORT',
      'password:PASSWORD_MISSING_UPPERCASE',
      'password:PASSWORD_MISSING_NUMBER',
      'password:PASSWORD_MISSING_SYMBOL',
    ]);
  });

  it('CA-5: una contraseña igual al correo es `PASSWORD_EQUALS_EMAIL`', () => {
    expect(
      reasonsOf(registerRequestSchema, {
        ...VALID_REGISTRATION,
        email: 'Ana.Lopez-2026@nimbo.me',
        password: 'ana.lopez-2026@NIMBO.ME',
      }),
    ).toEqual(['password:PASSWORD_EQUALS_EMAIL']);
  });

  it('CA-5: una contraseña común es `PASSWORD_COMMON`', () => {
    expect(
      reasonsOf(registerRequestSchema, { ...VALID_REGISTRATION, password: 'G00dPa$$w0rd' }),
    ).toEqual(['password:PASSWORD_COMMON']);
  });

  it.each(['rol', 'role', 'correoVerificado', 'estado', 'version', 'plan', 'planId'])(
    'CA-7: el campo no declarado `%s` es `UNKNOWN_FIELD`',
    (key) => {
      expect(reasonsOf(registerRequestSchema, { ...VALID_REGISTRATION, [key]: 'x' })).toEqual([
        `${key}:UNKNOWN_FIELD`,
      ]);
    },
  );

  it('CA-6/CA-7: con varios errores a la vez, los informa todos', () => {
    expect(
      reasonsOf(registerRequestSchema, {
        email: 'ana',
        password: 'nimbo-seguro-2026',
        acceptTerms: false,
        rol: 'ADMIN',
      }).sort(),
    ).toEqual(
      [
        'rol:UNKNOWN_FIELD',
        'fullName:REQUIRED',
        'email:INVALID_EMAIL',
        'acceptTerms:TERMS_NOT_ACCEPTED',
        'password:PASSWORD_MISSING_UPPERCASE',
      ].sort(),
    );
  });

  it('CA-6: los mensajes de `toFieldIssues` son los de `IDENTITY_FIELD_MESSAGES`', () => {
    const issues = issuesOf(registerRequestSchema, {
      fullName: 'a'.repeat(101),
      email: 'ana',
      password: 'corta',
      acceptTerms: false,
      plan: 'x',
    });

    expect(issues).toHaveLength(8);
    for (const issue of issues) {
      expect(issue.message).toBe(
        IDENTITY_FIELD_MESSAGES[issue.reason as keyof typeof IDENTITY_FIELD_MESSAGES],
      );
    }
  });
});

describe('resendVerificationRequestSchema', () => {
  it('CA-6: acepta `{ email }`', () => {
    expect(resendVerificationRequestSchema.parse({ email: 'ana@nimbo.me' })).toEqual({
      email: 'ana@nimbo.me',
    });
  });

  it('CA-6: rechaza un correo mal formado', () => {
    expect(reasonsOf(resendVerificationRequestSchema, { email: 'ana' })).toEqual([
      'email:INVALID_EMAIL',
    ]);
  });

  it('CA-7: es estricto', () => {
    expect(reasonsOf(resendVerificationRequestSchema, { email: 'ana@nimbo.me', x: 1 })).toEqual([
      'x:UNKNOWN_FIELD',
    ]);
  });
});

describe('verifyEmailRequestSchema', () => {
  it.each(['', 'no-es-base64url!', 'a'.repeat(43)])(
    'CA-11 (b): acepta cualquier `token` de texto («%s»); el formato lo rechaza el servicio',
    (token) => {
      expect(verifyEmailRequestSchema.parse({ token })).toEqual({ token });
    },
  );

  it('CA-6: un `token` ausente es `REQUIRED`', () => {
    expect(reasonsOf(verifyEmailRequestSchema, {})).toEqual(['token:REQUIRED']);
  });

  it('CA-7: es estricto', () => {
    expect(reasonsOf(verifyEmailRequestSchema, { token: 'a', x: 1 })).toEqual(['x:UNKNOWN_FIELD']);
  });
});

describe('esquemas de respuesta', () => {
  it('acceptedResponseSchema acepta solo `{ status: "accepted" }`', () => {
    expect(acceptedResponseSchema.safeParse({ status: 'accepted' }).success).toBe(true);
    expect(acceptedResponseSchema.safeParse({ status: 'ok' }).success).toBe(false);
  });

  it('verifyEmailResponseSchema acepta `verified` y `already-verified`', () => {
    expect(verifyEmailResponseSchema.safeParse({ status: 'verified' }).success).toBe(true);
    expect(verifyEmailResponseSchema.safeParse({ status: 'already-verified' }).success).toBe(true);
    expect(verifyEmailResponseSchema.safeParse({ status: 'expired' }).success).toBe(false);
  });
});
