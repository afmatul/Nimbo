import type { z } from 'zod';

import { toFieldIssues } from '../validation';

import { IDENTITY_FIELD_MESSAGES } from './error-codes';
import { SESSION_LIST_MAX_ITEMS } from './parameters';
import {
  acceptedResponseSchema,
  accountSetupCheckRequestSchema,
  accountSetupCheckResponseSchema,
  accountSetupRequestSchema,
  accountSetupResponseSchema,
  enrollInternalAccountRequestSchema,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resendVerificationRequestSchema,
  resetLinkCheckResponseSchema,
  resetPasswordRequestSchema,
  resetPasswordResponseSchema,
  resetTokenRequestSchema,
  revokeOthersResponseSchema,
  sessionListResponseSchema,
  sessionResponseSchema,
  sessionSummarySchema,
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

describe('loginRequestSchema', () => {
  const VALID_LOGIN = { email: 'ana@nimbo.me', password: 'cualquier-cosa' };

  it('CA-1: acepta `{ email, password }` sin aplicar la política de contraseña', () => {
    expect(loginRequestSchema.parse(VALID_LOGIN)).toEqual(VALID_LOGIN);
  });

  it('CA-1: un correo mal formado es `INVALID_EMAIL`', () => {
    expect(reasonsOf(loginRequestSchema, { ...VALID_LOGIN, email: 'ana' })).toEqual([
      'email:INVALID_EMAIL',
    ]);
  });

  it('CA-1: una contraseña vacía o ausente es `REQUIRED`', () => {
    expect(reasonsOf(loginRequestSchema, { ...VALID_LOGIN, password: '' })).toEqual([
      'password:REQUIRED',
    ]);
    expect(reasonsOf(loginRequestSchema, { email: VALID_LOGIN.email })).toEqual([
      'password:REQUIRED',
    ]);
  });

  it('CA-1: es estricto', () => {
    expect(reasonsOf(loginRequestSchema, { ...VALID_LOGIN, rememberMe: true })).toEqual([
      'rememberMe:UNKNOWN_FIELD',
    ]);
  });
});

describe('forgotPasswordRequestSchema', () => {
  it('CA-18: acepta `{ email }`', () => {
    expect(forgotPasswordRequestSchema.parse({ email: 'ana@nimbo.me' })).toEqual({
      email: 'ana@nimbo.me',
    });
  });

  it('CA-18: un correo mal formado es `INVALID_EMAIL`', () => {
    expect(reasonsOf(forgotPasswordRequestSchema, { email: 'ana@' })).toEqual([
      'email:INVALID_EMAIL',
    ]);
  });

  it('CA-18: es estricto', () => {
    expect(reasonsOf(forgotPasswordRequestSchema, { email: 'ana@nimbo.me', x: 1 })).toEqual([
      'x:UNKNOWN_FIELD',
    ]);
  });
});

describe('resetTokenRequestSchema', () => {
  it.each(['', 'mal-formado!'])(
    'CA-20: acepta cualquier `token` de texto («%s»); el formato lo rechaza el servicio',
    (token) => {
      expect(resetTokenRequestSchema.parse({ token })).toEqual({ token });
    },
  );

  it('CA-20: un `token` ausente es `REQUIRED` y el esquema es estricto', () => {
    expect(reasonsOf(resetTokenRequestSchema, {})).toEqual(['token:REQUIRED']);
    expect(reasonsOf(resetTokenRequestSchema, { token: 'a', x: 1 })).toEqual(['x:UNKNOWN_FIELD']);
  });
});

describe('resetPasswordRequestSchema', () => {
  const VALID_RESET = { token: 'token-opaco', password: 'Nimbo-Seguro-2026' };

  it('CA-21: acepta `{ token, password }` con una contraseña que cumple D-6', () => {
    expect(resetPasswordRequestSchema.parse(VALID_RESET)).toEqual(VALID_RESET);
  });

  it('CA-21: cada regla de D-6 incumplida es un issue propio de `password`', () => {
    expect(reasonsOf(resetPasswordRequestSchema, { ...VALID_RESET, password: 'corta' })).toEqual([
      'password:PASSWORD_TOO_SHORT',
      'password:PASSWORD_MISSING_UPPERCASE',
      'password:PASSWORD_MISSING_NUMBER',
      'password:PASSWORD_MISSING_SYMBOL',
    ]);
  });

  it('CA-21: no evalúa la regla del correo (la completa el servicio)', () => {
    expect(
      reasonsOf(resetPasswordRequestSchema, {
        ...VALID_RESET,
        password: 'Ana.Lopez-2026@nimbo.me',
      }),
    ).toEqual([]);
  });

  it('CA-20/CA-21: es estricto y exige los dos campos', () => {
    expect(reasonsOf(resetPasswordRequestSchema, { ...VALID_RESET, email: 'a@b.co' })).toEqual([
      'email:UNKNOWN_FIELD',
    ]);
    expect(reasonsOf(resetPasswordRequestSchema, {}).sort()).toEqual([
      'password:REQUIRED',
      'token:REQUIRED',
    ]);
  });
});

describe('changePasswordRequestSchema', () => {
  const VALID_CHANGE = { currentPassword: 'Actual-2026!', newPassword: 'Nimbo-Nueva-2026' };

  it('CA-22: acepta `{ currentPassword, newPassword }`', () => {
    expect(changePasswordRequestSchema.parse(VALID_CHANGE)).toEqual(VALID_CHANGE);
  });

  it('CA-22: una contraseña actual vacía es `REQUIRED`', () => {
    expect(
      reasonsOf(changePasswordRequestSchema, { ...VALID_CHANGE, currentPassword: '' }),
    ).toEqual(['currentPassword:REQUIRED']);
  });

  it('CA-22: no admite un campo de confirmación (D-7: solo existe en el cliente)', () => {
    expect(
      reasonsOf(changePasswordRequestSchema, {
        ...VALID_CHANGE,
        confirmPassword: VALID_CHANGE.newPassword,
      }),
    ).toEqual(['confirmPassword:UNKNOWN_FIELD']);
  });
});

describe('esquemas de respuesta de 001', () => {
  it('acceptedResponseSchema acepta solo `{ status: "accepted" }`', () => {
    expect(acceptedResponseSchema.safeParse({ status: 'accepted' }).success).toBe(true);
    expect(acceptedResponseSchema.safeParse({ status: 'ok' }).success).toBe(false);
  });

  it('verifyEmailResponseSchema acepta `verified` y `already-verified`', () => {
    expect(verifyEmailResponseSchema.safeParse({ status: 'verified' }).success).toBe(true);
    expect(verifyEmailResponseSchema.safeParse({ status: 'already-verified' }).success).toBe(true);
    expect(verifyEmailResponseSchema.safeParse({ status: 'expired' }).success).toBe(false);
  });

  it('CA-1: verifyEmailResponseSchema acepta `verified` con la sesión que abre la verificación', () => {
    const response = { status: 'verified', session: VALID_SESSION };

    expect(verifyEmailResponseSchema.parse(response)).toEqual(response);
  });

  it('CA-1: verifyEmailResponseSchema rechaza `already-verified` con sesión', () => {
    expect(
      verifyEmailResponseSchema.safeParse({ status: 'already-verified', session: VALID_SESSION })
        .success,
    ).toBe(false);
  });
});

describe('respuestas de la recuperación (002 plan §5)', () => {
  it('CA-20: resetLinkCheckResponseSchema acepta solo `{ status: "valid" }`', () => {
    expect(resetLinkCheckResponseSchema.parse({ status: 'valid' })).toEqual({ status: 'valid' });
    expect(resetLinkCheckResponseSchema.safeParse({ status: 'expired' }).success).toBe(false);
  });

  it('CA-19: resetPasswordResponseSchema acepta solo `{ status: "password-reset" }` y sin sesión', () => {
    expect(resetPasswordResponseSchema.parse({ status: 'password-reset' })).toEqual({
      status: 'password-reset',
    });
    expect(
      resetPasswordResponseSchema.safeParse({ status: 'password-reset', session: VALID_SESSION })
        .success,
    ).toBe(false);
  });
});

const VALID_SESSION = {
  accessToken: 'eyJhbGciOiJIUzI1NiJ9.e30.firma',
  accessTokenExpiresAt: '2026-09-30T15:15:00.000Z',
  user: {
    id: '0b7a3c1e-6f4d-4d8a-9b1e-2c3d4e5f6a7b',
    fullName: 'Ana López',
    email: 'ana@nimbo.me',
    role: 'CLIENT',
  },
};

describe('sessionResponseSchema', () => {
  it('CA-1: acepta `{ accessToken, accessTokenExpiresAt, user: { id, fullName, email, role } }`', () => {
    expect(sessionResponseSchema.parse(VALID_SESSION)).toEqual(VALID_SESSION);
  });

  it.each(['2026-09-30T09:15:00-06:00', '2026-09-30', 'mañana'])(
    'CA-1: `accessTokenExpiresAt` «%s» no es ISO-8601 UTC',
    (accessTokenExpiresAt) => {
      expect(
        sessionResponseSchema.safeParse({ ...VALID_SESSION, accessTokenExpiresAt }).success,
      ).toBe(false);
    },
  );

  it.each(['ADMIN', 'SUPPORT', 'OPERATOR'])('CA-1: acepta el rol %s', (role) => {
    const session = { ...VALID_SESSION, user: { ...VALID_SESSION.user, role } };

    expect(sessionResponseSchema.safeParse(session).success).toBe(true);
  });

  it('CA-1: rechaza un rol desconocido', () => {
    const session = { ...VALID_SESSION, user: { ...VALID_SESSION.user, role: 'ROOT' } };

    expect(sessionResponseSchema.safeParse(session).success).toBe(false);
  });

  it('CA-1: el `user` no admite campos de más (D-13: nada que no pida la web)', () => {
    const session = { ...VALID_SESSION, user: { ...VALID_SESSION.user, estado: 'ACTIVE' } };

    expect(sessionResponseSchema.safeParse(session).success).toBe(false);
  });
});

const VALID_SUMMARY = {
  id: '5d2f8e0a-1b3c-4d5e-8f9a-0b1c2d3e4f5a',
  browser: 'Chrome 129',
  os: 'Windows 11',
  deviceKind: 'desktop',
  startedAt: '2026-09-28T14:00:00.000Z',
  lastActiveAt: '2026-09-30T15:00:00.000Z',
  current: true,
};

describe('sessionSummarySchema', () => {
  it('CA-11: acepta el resumen de una sesión', () => {
    expect(sessionSummarySchema.parse(VALID_SUMMARY)).toEqual(VALID_SUMMARY);
  });

  it.each(['desktop', 'mobile', 'tablet'])('CA-11: acepta `deviceKind` %s', (deviceKind) => {
    expect(sessionSummarySchema.safeParse({ ...VALID_SUMMARY, deviceKind }).success).toBe(true);
  });

  it('CA-11: rechaza otro `deviceKind`', () => {
    expect(sessionSummarySchema.safeParse({ ...VALID_SUMMARY, deviceKind: 'tv' }).success).toBe(
      false,
    );
  });

  it.each([
    ['ip', '203.0.113.7'],
    ['userAgent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'],
    ['deviceId', '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'],
  ])('CA-11: rechaza `%s` (nunca sale de la API)', (key, value) => {
    expect(sessionSummarySchema.safeParse({ ...VALID_SUMMARY, [key]: value }).success).toBe(false);
  });
});

describe('sessionListResponseSchema', () => {
  it(`CA-11: acepta hasta ${String(SESSION_LIST_MAX_ITEMS)} sesiones`, () => {
    const items = Array.from({ length: SESSION_LIST_MAX_ITEMS }, () => VALID_SUMMARY);

    expect(sessionListResponseSchema.safeParse({ items }).success).toBe(true);
    expect(sessionListResponseSchema.safeParse({ items: [] }).success).toBe(true);
  });

  it(`CA-11: rechaza más de ${String(SESSION_LIST_MAX_ITEMS)} sesiones`, () => {
    const items = Array.from({ length: SESSION_LIST_MAX_ITEMS + 1 }, () => VALID_SUMMARY);

    expect(sessionListResponseSchema.safeParse({ items }).success).toBe(false);
  });
});

describe('revokeOthersResponseSchema', () => {
  it('CA-13: acepta `{ revokedCount }` entero no negativo', () => {
    expect(revokeOthersResponseSchema.parse({ revokedCount: 0 })).toEqual({ revokedCount: 0 });
    expect(revokeOthersResponseSchema.safeParse({ revokedCount: 3 }).success).toBe(true);
  });

  it.each([-1, 1.5, '2'])('CA-13: rechaza `revokedCount` %p', (revokedCount) => {
    expect(revokeOthersResponseSchema.safeParse({ revokedCount }).success).toBe(false);
  });
});

const VALID_ENROLLMENT = {
  fullName: 'Marta Ruiz',
  email: 'marta@nimbo.me',
  employeeCode: 'SOP-014',
  role: 'SUPPORT',
};

describe('enrollInternalAccountRequestSchema (011 CA-5, CA-6)', () => {
  it('CA-5: acepta un alta válida', () => {
    expect(enrollInternalAccountRequestSchema.parse(VALID_ENROLLMENT)).toEqual(VALID_ENROLLMENT);
  });

  it.each(['ADMIN', 'SUPPORT', 'OPERATOR'])('CA-5: acepta el rol interno %s', (role) => {
    expect(reasonsOf(enrollInternalAccountRequestSchema, { ...VALID_ENROLLMENT, role })).toEqual(
      [],
    );
  });

  it.each([
    ['CLIENT', 'role:INVALID_ROLE'],
    ['ROOT', 'role:INVALID_ROLE'],
    [undefined, 'role:REQUIRED'],
  ])('CA-6: el rol %p es %s', (role, reason) => {
    expect(reasonsOf(enrollInternalAccountRequestSchema, { ...VALID_ENROLLMENT, role })).toEqual([
      reason,
    ]);
  });

  it.each([
    ['  sop-014  ', []],
    ['A', []],
    ['A'.repeat(20), []],
    ['A'.repeat(21), ['employeeCode:INVALID_EMPLOYEE_CODE']],
    ['SOP 014', ['employeeCode:INVALID_EMPLOYEE_CODE']],
    ['SOP_014', ['employeeCode:INVALID_EMPLOYEE_CODE']],
    ['   ', ['employeeCode:REQUIRED']],
    [undefined, ['employeeCode:REQUIRED']],
  ])('RN-5: el código de empleado %p da %p', (employeeCode, reasons) => {
    expect(
      reasonsOf(enrollInternalAccountRequestSchema, { ...VALID_ENROLLMENT, employeeCode }),
    ).toEqual(reasons);
  });

  it('CA-6: valida nombre y correo como el registro (Q-4b)', () => {
    expect(
      reasonsOf(enrollInternalAccountRequestSchema, {
        ...VALID_ENROLLMENT,
        fullName: ' ',
        email: 'sin-arroba',
      }),
    ).toEqual(['fullName:REQUIRED', 'email:INVALID_EMAIL']);
  });

  it('CA-6: un campo extra es `UNKNOWN_FIELD`', () => {
    expect(
      reasonsOf(enrollInternalAccountRequestSchema, { ...VALID_ENROLLMENT, password: 'x' }),
    ).toEqual(['password:UNKNOWN_FIELD']);
  });
});

describe('enlace de alta interna (011 CA-5)', () => {
  it('CA-5: la comprobación pide solo el `token`', () => {
    expect(reasonsOf(accountSetupCheckRequestSchema, { token: 'abc' })).toEqual([]);
    expect(reasonsOf(accountSetupCheckRequestSchema, { token: 'abc', extra: 1 })).toEqual([
      'extra:UNKNOWN_FIELD',
    ]);
  });

  it('CA-5: fijar la contraseña aplica la política de 001 (sin el correo, que completa el servicio)', () => {
    expect(
      reasonsOf(accountSetupRequestSchema, { token: 'abc', password: 'Nimbo-Seguro-2026' }),
    ).toEqual([]);
    expect(reasonsOf(accountSetupRequestSchema, { token: 'abc', password: 'corta' })).toContain(
      'password:PASSWORD_TOO_SHORT',
    );
  });

  it('CA-5: las respuestas son `valid` y `password-set`, estrictas', () => {
    expect(accountSetupCheckResponseSchema.parse({ status: 'valid' })).toEqual({ status: 'valid' });
    expect(accountSetupResponseSchema.parse({ status: 'password-set' })).toEqual({
      status: 'password-set',
    });
    expect(accountSetupResponseSchema.safeParse({ status: 'password-set', x: 1 }).success).toBe(
      false,
    );
  });
});
