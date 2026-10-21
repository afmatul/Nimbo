import { ACCOUNT_SETUP_LINK_TTL_HOURS } from '@nimbo/contracts';

import { FixedClock } from '../../../shared/domain/fixed.clock';
import { assertIdempotencyKey } from '../../notifications';
import { OpaqueToken } from '../domain/opaque-token.vo';

import { AccountSetupLinkIssuer } from './account-setup-link-issuer';
import { InMemoryVerificationTokenRepository } from './testing/in-memory-verification-token.repository';
import { anInternalUser } from './testing/internal-user.builder';

const NOW = new Date('2026-10-09T15:00:00.000Z');
const MS_PER_HOUR = 3_600_000;
const SETUP_LINK = /^http:\/\/localhost\/crear-contrasena#token=([A-Za-z0-9_-]{43})$/;

const setup = () => {
  const tokens = new InMemoryVerificationTokenRepository();
  const issuer = new AccountSetupLinkIssuer(tokens, new FixedClock(NOW), {
    webPublicUrl: 'http://localhost/',
    cookieSecure: false,
  });
  return { tokens, issuer };
};

const tokenValueOf = (text: string): string => {
  const line = text.split('\n').find((candidate) => SETUP_LINK.test(candidate));
  const value = line?.match(SETUP_LINK)?.[1];
  if (value === undefined) {
    throw new Error('El correo no trae el enlace de alta.');
  }
  return value;
};

describe('AccountSetupLinkIssuer (011 CA-5)', () => {
  it('CA-5: emite un enlace `alta_interna` que vence `ACCOUNT_SETUP_LINK_TTL_HOURS` después', async () => {
    const { tokens, issuer } = setup();

    await issuer.issue(anInternalUser().build());

    const [token] = tokens.all();
    expect(token?.type).toBe('alta_interna');
    expect(token?.createdAt).toEqual(NOW);
    expect(token?.expiresAt).toEqual(
      new Date(NOW.getTime() + ACCOUNT_SETUP_LINK_TTL_HOURS * MS_PER_HOUR),
    );
  });

  it('CA-5: guarda solo el hash del token; el valor en claro solo va en el correo', async () => {
    const { tokens, issuer } = setup();

    const message = await issuer.issue(anInternalUser().build());

    const value = tokenValueOf(message.text);
    expect(tokens.all()[0]?.tokenHash).toBe(OpaqueToken.hashOf(value));
    expect(JSON.stringify(tokens.all())).not.toContain(value);
  });

  it('CA-5: devuelve el correo «Crear tu contraseña» para la cuenta, sin duplicar la barra del enlace', async () => {
    const { tokens, issuer } = setup();
    const user = anInternalUser().withEmail('sofia.ramirez@nimbo.me').build();

    const message = await issuer.issue(user);

    expect(message).toMatchObject({
      to: 'sofia.ramirez@nimbo.me',
      subject: 'Crea tu contraseña de Nimbo',
      tag: 'identity.internal-invitation',
      recipientId: user.id,
      idempotencyKey: `identity.internal-invitation.${tokens.all()[0]?.id ?? ''}`,
    });
    expect(message.html).toContain(
      `http://localhost/crear-contrasena#token=${tokenValueOf(message.text)}`,
    );
    expect(() => {
      assertIdempotencyKey(message.idempotencyKey);
    }).not.toThrow();
  });
});
