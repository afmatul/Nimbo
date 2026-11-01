import {
  PUBLIC_LINK_EXPIRY_OPTIONS as CONTRACT_EXPIRY_OPTIONS,
  PUBLIC_LINK_STATUSES as CONTRACT_STATUSES,
  SHARING_ERROR_CODES,
  SHARING_FIELD_MESSAGES,
} from '@nimbo/contracts';

import { PasswordHash } from '../../../shared/domain/password-hash.vo';

import { SharingInvalidRequestError } from './errors';
import { PUBLIC_LINK_EXPIRY_DAYS, PUBLIC_LINK_STATUSES, PublicLink } from './public-link';
import type { CreatePublicLinkInput } from './public-link';

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date('2026-10-31T10:00:00.000Z');
const PASSWORD_HASH = PasswordHash.fromPhc('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA');

const input = (overrides: Partial<CreatePublicLinkInput> = {}): CreatePublicLinkInput => ({
  id: '0b6f1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  fileId: '1c7a2e3f-4b5c-4d6e-9f70-8a9b0c1d2e3f',
  ownerId: '2d8b3f40-5c6d-4e7f-a081-9b0c1d2e3f40',
  expiresInDays: 7,
  passwordHash: null,
  now: NOW,
  ...overrides,
});

const hoursAfterNow = (hours: number): Date => new Date(NOW.getTime() + hours * HOUR_MS);

const creationError = (expiresInDays: number): unknown => {
  try {
    PublicLink.create(input({ expiresInDays }));
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('PublicLink (plan 013 §2)', () => {
  it('CA-2: los vencimientos que se aceptan son los de `@nimbo/contracts`', () => {
    expect(PUBLIC_LINK_EXPIRY_DAYS).toEqual(CONTRACT_EXPIRY_OPTIONS);
  });

  it('CA-7: los estados son los de `@nimbo/contracts`', () => {
    expect(PUBLIC_LINK_STATUSES).toEqual(CONTRACT_STATUSES);
  });

  it.each([
    [1, 24],
    [7, 168],
    [30, 720],
  ])('CA-1, S-4: con %i días vence %i horas exactas después de crearse', (days, hours) => {
    const { link } = PublicLink.create(input({ expiresInDays: days }));

    expect(link.toSnapshot().expiresAt).toEqual(hoursAfterNow(hours));
  });

  it('CA-1: guarda el archivo, el propietario, la fecha y solo el hash del token', () => {
    const { link, token } = PublicLink.create(input());

    expect(link.toSnapshot()).toEqual({
      id: input().id,
      fileId: input().fileId,
      ownerId: input().ownerId,
      tokenHash: token.hash(),
      passwordHash: null,
      expiresAt: hoursAfterNow(168),
      createdAt: NOW,
    });
    expect(JSON.stringify(link.toSnapshot())).not.toContain(token.toString());
  });

  it.each([0, 2, 14, 31, -7, 7.5, Number.NaN])(
    'CA-2: un vencimiento de %p días es el 422 del contrato con su campo',
    (days) => {
      const error = creationError(days);

      expect(error).toBeInstanceOf(SharingInvalidRequestError);
      expect(error).toMatchObject({
        code: SHARING_ERROR_CODES.SHARING_INVALID_REQUEST,
        fields: [
          {
            field: 'expiresInDays',
            reason: 'INVALID_EXPIRY',
            message: SHARING_FIELD_MESSAGES.INVALID_EXPIRY,
          },
        ],
      });
    },
  );

  it('CA-4: otro enlace del mismo archivo nace con otro token, así el hash anterior no lo alcanza', () => {
    const first = PublicLink.create(input());
    const second = PublicLink.create(input({ id: '5a1e2f30-4b5c-4d6e-8f70-9a0b1c2d3e4f' }));

    expect(second.token.toString()).not.toBe(first.token.toString());
    expect(second.link.toSnapshot().tokenHash).not.toBe(first.link.toSnapshot().tokenHash);
  });

  it('CA-1, RN-8: pide contraseña solo si tiene su hash', () => {
    const withPassword = PublicLink.create(input({ passwordHash: PASSWORD_HASH })).link;

    expect(PublicLink.create(input()).link.requiresPassword).toBe(false);
    expect(withPassword.requiresPassword).toBe(true);
  });

  it('RN-8: la contraseña se guarda como `PasswordHash`, que no se serializa', () => {
    const { link } = PublicLink.create(input({ passwordHash: PASSWORD_HASH }));

    expect(link.toSnapshot().passwordHash).toBe(PASSWORD_HASH);
    expect(JSON.stringify(link.toSnapshot())).not.toContain(PASSWORD_HASH.reveal());
  });

  it.each([
    [0, 'active'],
    [167, 'active'],
    [168, 'expired'],
    [500, 'expired'],
  ])('CA-7, S-4: a las %i horas el estado es %s', (hours, status) => {
    const { link } = PublicLink.create(input());

    expect(link.statusAt(hoursAfterNow(hours))).toBe(status);
  });

  it('CA-7: un enlace leído de la base conserva sus datos y su estado', () => {
    const snapshot = PublicLink.create(input()).link.toSnapshot();
    const link = PublicLink.rehydrate(snapshot);

    expect(link.toSnapshot()).toEqual(snapshot);
    expect(link.id).toBe(snapshot.id);
    expect(link.statusAt(new Date(snapshot.expiresAt.getTime() - 1))).toBe('active');
  });
});
