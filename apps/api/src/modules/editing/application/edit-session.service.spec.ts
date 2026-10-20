import { createActor, Role } from '../../../shared';
import { EditSession } from '../domain/edit-session';
import { EditingSaveInProgressError } from '../domain/errors';

import { EditSessionService } from './edit-session.service';

const OWNER = '2d8b3f40-5c6d-4e7f-a081-9b0c1d2e3f40';
const FILE_ID = '1c7a2e3f-4b5c-4d6e-9f70-8a9b0c1d2e3f';
const CONNECTION_ID = 'conexion-1';
const NOW = new Date('2026-10-17T10:00:00.000Z');
const actor = createActor(OWNER, Role.CLIENT);

const openSession = (): EditSession =>
  EditSession.open({
    id: '0b6f1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
    fileId: FILE_ID,
    ownerId: OWNER,
    openedBy: OWNER,
    baseVersionId: '4fad5162-7e8f-4091-82a3-1d2e3f405162',
    now: NOW,
  });

const fakes = (open: EditSession, ownerReadOnly = false) => {
  const calls: string[] = [];
  const presence = {
    admit: jest.fn(async () => {
      calls.push('admit');
    }),
    announce: jest.fn(() => calls.push('announce')),
  };
  const sessions = {
    findOpenForUpdate: jest.fn(async () => open),
    activeParticipants: jest.fn(async () => []),
    join: jest.fn(async () => undefined),
  };
  const file = { id: FILE_ID, ownerId: OWNER, name: 'a.docx', kind: 'docx', sizeBytes: 10n };
  const deps = [
    { withActor: (_actor: unknown, work: () => unknown) => work() },
    { find: async () => ({ ...file, currentVersionId: open.baseVersionId }) },
    { can: async () => true },
    { limitsFor: async () => ({ maxEditors: 3, readOnly: ownerReadOnly }) },
    sessions,
    { displayNames: async () => new Map([[OWNER, 'Ana']]) },
    { factory: async () => ({ build: () => ({}) }) },
    { maxDocBytes: 1024 },
    { record: async () => undefined },
    { now: () => NOW },
    { info: jest.fn(), warn: jest.fn() },
    presence,
    {},
  ];
  const service = new (
    EditSessionService as unknown as new (...args: unknown[]) => EditSessionService
  )(...deps);
  return { service, presence, calls };
};

describe('EditSessionService.open (review 016 S-1)', () => {
  it('CA-6: con la sesión anterior guardándose responde 409 sin unir la conexión a la sala', async () => {
    const { service, presence } = fakes(openSession().startSaving());

    await expect(service.open(actor, FILE_ID, { connectionId: CONNECTION_ID })).rejects.toThrow(
      EditingSaveInProgressError,
    );
    expect(presence.admit).not.toHaveBeenCalled();
  });

  it('CA-6: en edición une la conexión a la sala antes de avisar la lista nueva', async () => {
    const { service, presence, calls } = fakes(openSession());

    await service.open(actor, FILE_ID, { connectionId: CONNECTION_ID });

    expect(presence.admit).toHaveBeenCalledWith(actor, CONNECTION_ID, FILE_ID);
    expect(calls).toEqual(['admit', 'announce']);
  });

  it('010 CA-13, RN-11: con la cuenta propietaria en solo lectura abre en `view`', async () => {
    const { service } = fakes(openSession(), true);

    const opened = await service.open(actor, FILE_ID, { connectionId: CONNECTION_ID });

    expect(opened).toMatchObject({ mode: 'view', readOnlyReason: 'EDITING_ACCOUNT_READ_ONLY' });
  });
});
