import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { AccessLevel } from '../domain/access-level.enum';
import { Action } from '../domain/action.enum';

import type { IAccessLevelReader } from './i-access-level-reader.port';
import { PermissionResolver } from './permission-resolver';

const CLIENT_ID = '7d0e1c9a-3b2f-4c5d-8e6f-1a2b3c4d5e6f';
const INTERNAL_ID = '0f9e8d7c-6b5a-4c3d-9e2f-1a0b9c8d7e6f';
const NODE_ID = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f';

const INTERNAL_ROLES = [Role.ADMIN, Role.SUPPORT, Role.OPERATOR] as const;
const CONTENT_ACTIONS = [
  Action.VIEW,
  Action.DOWNLOAD,
  Action.PREVIEW,
  Action.EDIT,
  Action.QUERY_AGENT,
] as const;

const readerReturning = (
  level: AccessLevel | null,
): IAccessLevelReader & { levelFor: jest.Mock } => ({
  levelFor: jest.fn<Promise<AccessLevel | null>, [Actor, string]>().mockResolvedValue(level),
});

describe('PermissionResolver', () => {
  describe.each(INTERNAL_ROLES)('rol interno %s', (role) => {
    const actor = createActor(INTERNAL_ID, role);

    it.each(CONTENT_ACTIONS)(
      'CA-9: `can(%s)` es `false` sin consultar el lector',
      async (action) => {
        const reader = readerReturning(AccessLevel.OWNER);
        const resolver = new PermissionResolver(reader);

        await expect(resolver.can(actor, NODE_ID, action)).resolves.toBe(false);
        expect(reader.levelFor).not.toHaveBeenCalled();
      },
    );

    it('CA-9: `levelFor` es `null` sin consultar el lector', async () => {
      const reader = readerReturning(AccessLevel.OWNER);
      const resolver = new PermissionResolver(reader);

      await expect(resolver.levelFor(actor, NODE_ID)).resolves.toBeNull();
      expect(reader.levelFor).not.toHaveBeenCalled();
    });
  });

  describe('rol CLIENT', () => {
    const actor = createActor(CLIENT_ID, Role.CLIENT);

    it.each(['no-es-uuid', '', `${NODE_ID}x`, "' OR 1=1 --"])(
      'CA-9: `nodeId` %p que no es UUID da `null` y `false` sin consultar el lector',
      async (nodeId) => {
        const reader = readerReturning(AccessLevel.OWNER);
        const resolver = new PermissionResolver(reader);

        await expect(resolver.levelFor(actor, nodeId)).resolves.toBeNull();
        await expect(resolver.can(actor, nodeId, Action.VIEW)).resolves.toBe(false);
        expect(reader.levelFor).not.toHaveBeenCalled();
      },
    );

    it('CA-8: con nivel `EDITOR`, `can(EDIT)` es `true` y `can(SHARE)` es `false`', async () => {
      const reader = readerReturning(AccessLevel.EDITOR);
      const resolver = new PermissionResolver(reader);

      await expect(resolver.can(actor, NODE_ID, Action.EDIT)).resolves.toBe(true);
      await expect(resolver.can(actor, NODE_ID, Action.SHARE)).resolves.toBe(false);
      expect(reader.levelFor).toHaveBeenCalledWith(actor, NODE_ID);
    });

    it('CA-8: `levelFor` devuelve el nivel que lee el lector', async () => {
      const resolver = new PermissionResolver(readerReturning(AccessLevel.VIEWER));

      await expect(resolver.levelFor(actor, NODE_ID)).resolves.toBe(AccessLevel.VIEWER);
    });

    it('CA-9: sin nivel (`null`) toda acción es `false`', async () => {
      const resolver = new PermissionResolver(readerReturning(null));

      await expect(resolver.can(actor, NODE_ID, Action.VIEW)).resolves.toBe(false);
    });
  });
});
