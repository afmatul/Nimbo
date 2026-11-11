import { SHARE_LEVELS as CONTRACT_SHARE_LEVELS } from '@nimbo/contracts';

import { CannotShareWithSelfError, SharingInvalidLevelError } from './errors';
import { SHARE_LEVELS, UserShare } from './user-share';
import type { GrantShareInput } from './user-share';

const OWNER_ID = '2d8b3f40-5c6d-4e7f-a081-9b0c1d2e3f40';
const RECIPIENT_ID = '3e9c4051-6d7e-4f80-b192-0c1d2e3f4051';
const NOW = new Date('2026-10-30T10:00:00.000Z');

const input = (overrides: Partial<GrantShareInput> = {}): GrantShareInput => ({
  id: '0b6f1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  ownerId: OWNER_ID,
  recipientId: RECIPIENT_ID,
  node: { type: 'folder', id: '1c7a2e3f-4b5c-4d6e-9f70-8a9b0c1d2e3f' },
  level: 'VIEWER',
  now: NOW,
  ...overrides,
});

describe('UserShare (plan 012 §2)', () => {
  it('CA-2: los niveles que se asignan son los de `@nimbo/contracts`', () => {
    expect(SHARE_LEVELS).toEqual(CONTRACT_SHARE_LEVELS);
  });

  it.each(['VIEWER', 'EDITOR'])('CA-1: se concede como %s, con su nodo y fecha', (level) => {
    const share = UserShare.grant(input({ level }));

    expect(share.toSnapshot()).toEqual({
      id: input().id,
      ownerId: OWNER_ID,
      recipientId: RECIPIENT_ID,
      node: input().node,
      level,
      createdAt: NOW,
    });
  });

  it.each(['OWNER', 'ADMIN', 'viewer', ''])(
    'CA-2: el nivel %p no se asigna (DF-31) y no nace la compartición',
    (level) => {
      expect(() => UserShare.grant(input({ level }))).toThrow(SharingInvalidLevelError);
    },
  );

  it('CA-3: no se comparte con uno mismo', () => {
    expect(() => UserShare.grant(input({ recipientId: OWNER_ID }))).toThrow(
      CannotShareWithSelfError,
    );
  });

  it('CA-5: cambiar a otro nivel lo cambia e indica que cambió', () => {
    const share = UserShare.grant(input({ level: 'VIEWER' }));

    expect(share.changeLevel('EDITOR')).toBe(true);
    expect(share.level).toBe('EDITOR');
  });

  it('CA-5: el mismo nivel no cambia nada', () => {
    const share = UserShare.grant(input({ level: 'EDITOR' }));

    expect(share.changeLevel('EDITOR')).toBe(false);
    expect(share.level).toBe('EDITOR');
  });

  it('CA-2: cambiar a `OWNER` se rechaza y conserva el nivel', () => {
    const share = UserShare.grant(input({ level: 'EDITOR' }));

    expect(() => share.changeLevel('OWNER')).toThrow(SharingInvalidLevelError);
    expect(share.level).toBe('EDITOR');
  });

  it('rehidrata la fila sin cambiar sus datos', () => {
    const snapshot = UserShare.grant(input()).toSnapshot();

    expect(UserShare.rehydrate(snapshot).toSnapshot()).toEqual(snapshot);
  });
});
