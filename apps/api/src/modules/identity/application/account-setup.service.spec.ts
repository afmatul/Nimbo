import { randomUUID } from 'node:crypto';

import { FixedClock } from '../../../shared';
import {
  IdentityWeakPasswordError,
  SetupLinkExpiredError,
  SetupLinkInvalidError,
} from '../domain/errors';
import { OpaqueToken } from '../domain/opaque-token.vo';
import { PasswordHash } from '../domain/password-hash.vo';
import { VerificationToken } from '../domain/verification-token.entity';
import type { VerificationTokenType } from '../domain/verification-token.entity';

import { AccountSetupService } from './account-setup.service';
import type { IPasswordHasher } from './ports/i-password-hasher.port';
import { aClientUser } from './testing/client-user.builder';
import { InMemoryUserRepository } from './testing/in-memory-user.repository';
import { InMemoryVerificationTokenRepository } from './testing/in-memory-verification-token.repository';
import { anInternalUser } from './testing/internal-user.builder';
import { RecordingTransactionRunner } from './testing/recording-transaction-runner';

const NOW = new Date('2026-10-09T15:00:00.000Z');
const HOUR_MS = 3_600_000;
const PASSWORD = 'Nimbo-Primera-Clave-2026';

const setup = () => {
  const clock = new FixedClock(NOW);
  const users = new InMemoryUserRepository();
  const tokens = new InMemoryVerificationTokenRepository();
  const hasher: IPasswordHasher = {
    hash: jest.fn((plain: string) => Promise.resolve(PasswordHash.fromPhc(`fake$${plain}`))),
    verify: jest.fn(() => Promise.resolve(false)),
  };
  const service = new AccountSetupService(
    users,
    tokens,
    hasher,
    new RecordingTransactionRunner([]),
    clock,
  );
  const user = anInternalUser().build();
  users.seed(user);
  /** Guarda un token del tipo dado para `userId` y devuelve su valor en claro. */
  const issue = async (
    userId = user.id,
    type: VerificationTokenType = 'alta_interna',
  ): Promise<string> => {
    const value = OpaqueToken.generate();
    await tokens.insert(
      VerificationToken.issue({
        id: randomUUID(),
        userId,
        type,
        tokenHash: value.hash(),
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() + 24 * HOUR_MS),
      }),
    );
    return value.toString();
  };
  const hashOf = async (id = user.id) => (await users.findById(id))?.passwordHash.reveal();
  return { clock, users, tokens, hasher, service, user, issue, hashOf };
};

describe('AccountSetupService (011 CA-5)', () => {
  it('CA-5: `checkLink` acepta un enlace vigente sin consumirlo', async () => {
    const { service, issue, tokens } = setup();
    const value = await issue();

    await service.checkLink(value);
    await service.checkLink(value);

    expect(tokens.all()[0]?.usedAt).toBeNull();
  });

  it('CA-5: fija la primera contraseña y consume el enlace', async () => {
    const { service, issue, tokens, hashOf } = setup();
    const value = await issue();

    await service.setFirstPassword({ token: value, password: PASSWORD });

    expect(await hashOf()).toBe(`fake$${PASSWORD}`);
    expect(tokens.all()[0]?.usedAt).toEqual(NOW);
  });

  it('CA-5: un enlace ya usado → `IDENTITY_SETUP_LINK_INVALID`', async () => {
    const { service, issue } = setup();
    const value = await issue();
    await service.setFirstPassword({ token: value, password: PASSWORD });

    await expect(service.checkLink(value)).rejects.toBeInstanceOf(SetupLinkInvalidError);
    await expect(
      service.setFirstPassword({ token: value, password: PASSWORD }),
    ).rejects.toBeInstanceOf(SetupLinkInvalidError);
  });

  it.each([
    ['mal formado', 'no-es-un-token'],
    ['desconocido', OpaqueToken.generate().toString()],
  ])('CA-5: un enlace %s → `IDENTITY_SETUP_LINK_INVALID`', async (_, value) => {
    const { service } = setup();

    await expect(service.checkLink(value)).rejects.toBeInstanceOf(SetupLinkInvalidError);
  });

  it('CA-5: un enlace de recuperación no sirve como enlace de alta', async () => {
    const { service, issue, user } = setup();

    await expect(service.checkLink(await issue(user.id, 'recuperacion'))).rejects.toBeInstanceOf(
      SetupLinkInvalidError,
    );
  });

  it('CA-5: pasadas las 24 h → `IDENTITY_SETUP_LINK_EXPIRED` y la contraseña no cambia', async () => {
    const { service, issue, clock, hashOf } = setup();
    const value = await issue();
    const before = await hashOf();
    clock.set(new Date(NOW.getTime() + 24 * HOUR_MS));

    await expect(service.checkLink(value)).rejects.toBeInstanceOf(SetupLinkExpiredError);
    await expect(
      service.setFirstPassword({ token: value, password: PASSWORD }),
    ).rejects.toBeInstanceOf(SetupLinkExpiredError);
    expect(await hashOf()).toBe(before);
  });

  it('CA-5: una contraseña débil → `IDENTITY_WEAK_PASSWORD` en `password` y el enlace sigue vigente', async () => {
    const { service, issue, tokens } = setup();
    const value = await issue();

    const error = await service
      .setFirstPassword({ token: value, password: 'corta' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IdentityWeakPasswordError);
    expect((error as IdentityWeakPasswordError).fields?.every((f) => f.field === 'password')).toBe(
      true,
    );
    expect(tokens.all()[0]?.usedAt).toBeNull();
  });

  it('CA-5: la contraseña igual al correo es débil', async () => {
    const { service, issue, user } = setup();

    await expect(
      service.setFirstPassword({ token: await issue(), password: user.email.value }),
    ).rejects.toBeInstanceOf(IdentityWeakPasswordError);
  });

  it('CA-5: un enlace que apunta a una cuenta de cliente es inválido', async () => {
    const { service, issue, users } = setup();
    const client = aClientUser().withId(randomUUID()).verified().build();
    users.seed(client);

    await expect(
      service.setFirstPassword({ token: await issue(client.id), password: PASSWORD }),
    ).rejects.toBeInstanceOf(SetupLinkInvalidError);
  });
});
