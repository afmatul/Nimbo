import { EditModePolicy } from './edit-mode-policy';
import type { EditModeInput } from './edit-mode-policy';
import { EditingUnsupportedFormatError } from './errors';

const MB = 1024n * 1024n;

/** Propietaria con plan Pro (3 editores), un `.docx` de 1 MB, tope editable de 50 MB y nadie más editando. */
const OWNER_ON_PRO: EditModeInput = {
  kind: 'docx',
  canEdit: true,
  openedByOwner: true,
  ownerMaxEditors: 3,
  activeEditors: 0,
  sizeBytes: MB,
  maxDocBytes: 50n * MB,
};

const COEDITOR: EditModeInput = { ...OWNER_ON_PRO, openedByOwner: false };

describe('EditModePolicy.decide (plan 016 §2)', () => {
  it.each<[string, EditModeInput]>([
    ['propietaria con plan Pro', OWNER_ON_PRO],
    ['coeditor con la propietaria en Equipo', { ...COEDITOR, ownerMaxEditors: 5 }],
    ['con 2 editores y lugar para 3', { ...OWNER_ON_PRO, activeEditors: 2 }],
    ['justo en el tope editable', { ...OWNER_ON_PRO, sizeBytes: 50n * MB }],
  ])('CA-1: abre en edición: %s', (_case, input) => {
    expect(EditModePolicy.decide(input)).toEqual({ mode: 'edit', readOnlyReason: null });
  });

  it.each<[string, EditModeInput, string]>([
    ['CA-3: Lector', { ...COEDITOR, canEdit: false }, 'EDITING_VIEW_ONLY'],
    [
      'CA-5: propietaria Personal o vencida',
      { ...OWNER_ON_PRO, ownerMaxEditors: 0 },
      'EDITING_PLAN_READ_ONLY',
    ],
    [
      'CA-22: coeditor con la propietaria sin edición',
      { ...COEDITOR, ownerMaxEditors: 0 },
      'EDITING_OWNER_PLAN_READ_ONLY',
    ],
    ['CA-7: límite de Pro', { ...OWNER_ON_PRO, activeEditors: 3 }, 'EDITING_LIMIT_REACHED'],
    [
      'CA-7: límite de Equipo',
      { ...COEDITOR, ownerMaxEditors: 5, activeEditors: 5 },
      'EDITING_LIMIT_REACHED',
    ],
    [
      'CA-21: mayor que el tope editable',
      { ...OWNER_ON_PRO, sizeBytes: 50n * MB + 1n },
      'EDITING_FILE_TOO_LARGE',
    ],
  ])('%s → solo lectura con su motivo', (_case, input, reason) => {
    expect(EditModePolicy.decide(input)).toEqual({ mode: 'view', readOnlyReason: reason });
  });

  it('CA-3: un Lector ve solo lectura por su nivel aunque el plan no edite ni haya lugar', () => {
    const reader = { ...COEDITOR, canEdit: false, ownerMaxEditors: 0, activeEditors: 9 };

    expect(EditModePolicy.decide(reader).readOnlyReason).toBe('EDITING_VIEW_ONLY');
  });

  it('CA-5: el plan sin edición pesa más que el tamaño y el límite', () => {
    const input = { ...OWNER_ON_PRO, ownerMaxEditors: 0, sizeBytes: 99n * MB, activeEditors: 9 };

    expect(EditModePolicy.decide(input).readOnlyReason).toBe('EDITING_PLAN_READ_ONLY');
  });

  it('CA-21: un archivo demasiado grande no espera lugar: el motivo es el tamaño', () => {
    const input = { ...OWNER_ON_PRO, sizeBytes: 99n * MB, activeEditors: 3 };

    expect(EditModePolicy.decide(input).readOnlyReason).toBe('EDITING_FILE_TOO_LARGE');
  });

  it.each(['xlsx', 'pdf', 'pptx', 'texto', 'otro'])(
    'CA-4: un archivo `%s` no se abre en el editor, ni en solo lectura',
    (kind) => {
      expect(() => EditModePolicy.decide({ ...OWNER_ON_PRO, kind })).toThrow(
        EditingUnsupportedFormatError,
      );
    },
  );

  it('CA-4: el formato se valida antes que el nivel o el plan', () => {
    const reader = { ...COEDITOR, kind: 'pdf', canEdit: false, ownerMaxEditors: 0 };

    expect(() => EditModePolicy.decide(reader)).toThrow(EditingUnsupportedFormatError);
  });
});
