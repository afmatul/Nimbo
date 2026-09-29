import { VERIFICATION_LINK_TTL_HOURS } from '@nimbo/contracts';

import { FixedClock } from '../../../shared/domain/fixed.clock';
import { assertIdempotencyKey } from '../../notifications';
import { OpaqueToken } from '../domain/opaque-token.vo';

import { aClientUser } from './testing/client-user.builder';
import { InMemoryVerificationTokenRepository } from './testing/in-memory-verification-token.repository';
import { VerificationLinkIssuer } from './verification-link-issuer';

const NOW = new Date('2026-09-30T15:00:00.000Z');
const MS_PER_HOUR = 3_600_000;
const WEB_PUBLIC_URL = 'http://localhost';
const LINK_PATTERN = /^http:\/\/localhost\/verificar-correo#token=([A-Za-z0-9_-]{43})$/;

const setup = (webPublicUrl = WEB_PUBLIC_URL) => {
  const tokens = new InMemoryVerificationTokenRepository();
  const issuer = new VerificationLinkIssuer(tokens, new FixedClock(NOW), { webPublicUrl });
  return { tokens, issuer };
};

const tokenValueOf = (text: string): string => {
  const line = text.split('\n').find((candidate) => LINK_PATTERN.test(candidate));
  const value = line?.match(LINK_PATTERN)?.[1];
  if (value === undefined) {
    throw new Error('El correo no trae el enlace de verificación');
  }
  return value;
};

describe('VerificationLinkIssuer', () => {
  it('CA-4: invalida los enlaces vigentes de la cuenta antes de insertar el nuevo', async () => {
    const { tokens, issuer } = setup();
    const user = aClientUser().build();
    const invalidate = jest.spyOn(tokens, 'invalidateActive');
    const insert = jest.spyOn(tokens, 'insert');

    const first = await issuer.issue(user);
    await issuer.issue(user);

    expect(invalidate).toHaveBeenCalledWith(user.id, 'verificacion', NOW);
    expect(invalidate.mock.invocationCallOrder[1]).toBeLessThan(
      insert.mock.invocationCallOrder[1] ?? 0,
    );
    const firstHash = OpaqueToken.hashOf(tokenValueOf(first.text));
    const stored = tokens.all();
    expect(stored).toHaveLength(2);
    expect(stored.find((token) => token.tokenHash === firstHash)?.stateAt(NOW)).toBe('invalidated');
    expect(stored.filter((token) => token.isValid(NOW))).toHaveLength(1);
  });

  it('CA-1: el token vence `VERIFICATION_LINK_TTL_HOURS` después de emitirse', async () => {
    const { tokens, issuer } = setup();

    await issuer.issue(aClientUser().build());

    const [token] = tokens.all();
    expect(token?.createdAt).toEqual(NOW);
    expect(token?.expiresAt).toEqual(
      new Date(NOW.getTime() + VERIFICATION_LINK_TTL_HOURS * MS_PER_HOUR),
    );
    expect(token?.type).toBe('verificacion');
  });

  it('CA-17: guarda solo el hash del token; el valor en claro solo va en el correo', async () => {
    const { tokens, issuer } = setup();

    const message = await issuer.issue(aClientUser().build());

    const value = tokenValueOf(message.text);
    const [token] = tokens.all();
    expect(token?.tokenHash).toBe(OpaqueToken.hashOf(value));
    expect(JSON.stringify(tokens.all())).not.toContain(value);
  });

  it('CA-1: devuelve el correo de verificación para la cuenta con el enlace en el fragmento', async () => {
    const { tokens, issuer } = setup();
    const user = aClientUser().withEmail('lucia@ejemplo.com').build();

    const message = await issuer.issue(user);

    const [token] = tokens.all();
    expect(message).toMatchObject({
      to: 'lucia@ejemplo.com',
      subject: 'Verifica tu correo para entrar a Nimbo',
      tag: 'identity.verification',
      recipientId: user.id,
      idempotencyKey: `identity.verification.${token?.id ?? ''}`,
    });
    expect(message.html).toContain(
      `http://localhost/verificar-correo#token=${tokenValueOf(message.text)}`,
    );
    expect(() => {
      assertIdempotencyKey(message.idempotencyKey);
    }).not.toThrow();
  });

  it('CA-1: no duplica la barra si `WEB_PUBLIC_URL` termina en «/»', async () => {
    const { issuer } = setup('http://localhost/');

    const message = await issuer.issue(aClientUser().build());

    expect(() => tokenValueOf(message.text)).not.toThrow();
  });

  it('CA-13: dos emisiones dan valores, ids y claves de idempotencia distintos', async () => {
    const { issuer } = setup();
    const user = aClientUser().build();

    const first = await issuer.issue(user);
    const second = await issuer.issue(user);

    expect(tokenValueOf(first.text)).not.toBe(tokenValueOf(second.text));
    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
  });
});
