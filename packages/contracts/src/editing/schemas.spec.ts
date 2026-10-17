import { EDITING_ERROR_CODES, READ_ONLY_REASONS } from './error-codes';
import {
  EDITING_EVENTS,
  editingPresenceSchema,
  editingSaveFailedSchema,
  editingVersionSavedSchema,
  openEditSessionRequestSchema,
  openEditSessionResponseSchema,
} from './schemas';

const PARTICIPANT = { userId: '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b', displayName: 'Ana López' };

const EDITING = {
  sessionId: '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  mode: 'edit',
  readOnlyReason: null,
  documentServerUrl: 'https://docs.nimbo.local',
  config: { document: { key: '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f' }, token: 'eyJ…' },
  participants: [PARTICIPANT],
  editors: 1,
  maxEditors: 3,
  lastSaveFailed: false,
};

const VIEWING = {
  ...EDITING,
  sessionId: null,
  mode: 'view',
  readOnlyReason: 'EDITING_VIEW_ONLY',
  participants: [],
  editors: 0,
};

describe('contratos de `editing` (plan 016 §4)', () => {
  it('CA-1: la apertura en edición trae sesión, configuración firmada y presencia', () => {
    expect(openEditSessionResponseSchema.parse(EDITING)).toEqual(EDITING);
  });

  it('CA-3: en solo lectura no hay sesión y el motivo es obligatorio', () => {
    expect(openEditSessionResponseSchema.parse(VIEWING)).toEqual(VIEWING);
    expect(
      openEditSessionResponseSchema.safeParse({ ...VIEWING, readOnlyReason: null }).success,
    ).toBe(false);
  });

  it('CA-1: en edición no hay motivo de solo lectura y sí sesión', () => {
    expect(
      openEditSessionResponseSchema.safeParse({ ...EDITING, readOnlyReason: 'EDITING_VIEW_ONLY' })
        .success,
    ).toBe(false);
    expect(openEditSessionResponseSchema.safeParse({ ...EDITING, sessionId: null }).success).toBe(
      false,
    );
  });

  it.each(READ_ONLY_REASONS)('CA-5, CA-7, CA-21, CA-22: `%s` es un motivo válido', (reason) => {
    expect(
      openEditSessionResponseSchema.parse({ ...VIEWING, readOnlyReason: reason }),
    ).toBeTruthy();
  });

  it('CA-3, CA-5, CA-7, CA-21, CA-22: los motivos de solo lectura son los de la spec', () => {
    expect([...READ_ONLY_REASONS].sort()).toEqual(
      [
        'EDITING_FILE_TOO_LARGE',
        'EDITING_LIMIT_REACHED',
        'EDITING_OWNER_PLAN_READ_ONLY',
        'EDITING_PLAN_READ_ONLY',
        'EDITING_VIEW_ONLY',
      ].sort(),
    );
  });

  it('CA-4, CA-6, CA-15: los códigos de error de la apertura', () => {
    expect(Object.values(EDITING_ERROR_CODES).sort()).toEqual(
      [
        'EDITING_INVALID_REQUEST',
        'EDITING_SAVE_IN_PROGRESS',
        'EDITING_UNAVAILABLE',
        'EDITING_UNSUPPORTED_FORMAT',
      ].sort(),
    );
  });

  it.each([
    ['motivo desconocido', { ...VIEWING, readOnlyReason: 'EDITING_TIRED' }],
    ['modo desconocido', { ...EDITING, mode: 'comment' }],
    ['editores negativos', { ...EDITING, editors: -1 }],
    ['participante sin nombre', { ...EDITING, participants: [{ userId: PARTICIPANT.userId }] }],
    ['correo del participante', { ...EDITING, participants: [{ ...PARTICIPANT, email: 'a@b.c' }] }],
    ['campo extra', { ...EDITING, objectKey: 'u/a/b/c' }],
  ])('CA-6: rechaza una respuesta con %s', (_case, response) => {
    expect(openEditSessionResponseSchema.safeParse(response).success).toBe(false);
  });

  it('CA-6: la apertura acepta el id de conexión del canal en vivo, y nada más', () => {
    expect(openEditSessionRequestSchema.parse({})).toEqual({});
    expect(openEditSessionRequestSchema.parse({ connectionId: 'kX9_a-1' })).toEqual({
      connectionId: 'kX9_a-1',
    });
    expect(openEditSessionRequestSchema.safeParse({ connectionId: '' }).success).toBe(false);
  });

  it('CA-6, RN-12: el cliente no puede enviar su nombre visible al abrir', () => {
    expect(openEditSessionRequestSchema.safeParse({ displayName: 'Otra persona' }).success).toBe(
      false,
    );
  });

  it('CA-6: el aviso de presencia lleva participantes con nombre, editores y máximo, y nada más', () => {
    const presence = { participants: [PARTICIPANT], editors: 1, maxEditors: 3 };

    expect(EDITING_EVENTS.PRESENCE).toBe('editing.presence');
    expect(editingPresenceSchema.parse(presence)).toEqual(presence);
    expect(editingPresenceSchema.safeParse({ ...presence, fileName: 'informe.docx' }).success).toBe(
      false,
    );
  });

  it('CA-9: el aviso de versión guardada lleva solo la sesión, sin contenido ni nombre de archivo', () => {
    const saved = { sessionId: EDITING.sessionId };

    expect(EDITING_EVENTS.VERSION_SAVED).toBe('editing.version-saved');
    expect(editingVersionSavedSchema.parse(saved)).toEqual(saved);
    expect(
      editingVersionSavedSchema.safeParse({ ...saved, fileName: 'informe.docx' }).success,
    ).toBe(false);
  });

  it('CA-14: `editing.save-failed` lleva solo la sesión y el archivo, sin nombre ni motivo', () => {
    const failed = { sessionId: EDITING.sessionId, fileId: PARTICIPANT.userId };

    expect(EDITING_EVENTS.SAVE_FAILED).toBe('editing.save-failed');
    expect(editingSaveFailedSchema.parse(failed)).toEqual(failed);
    expect(editingSaveFailedSchema.safeParse({ ...failed, fileName: 'informe.docx' }).success).toBe(
      false,
    );
  });
});
