import { BACKOFFICE_FIELD_MESSAGES } from '@nimbo/contracts';

import {
  QUOTA_FIELD_IDS,
  quotaRequestOf,
  VALIDITY_FIELD_IDS,
  validityRequestOf,
} from './limits-form-values';

const TODAY = '2026-10-26';
const BOUNDS = { expiresAt: '2026-11-01T06:00:00.000Z', today: TODAY };

describe('días de los diálogos de cuota y vigencia (011b CA-3, CA-7)', () => {
  it.each(['2030-02-30', '2030-13-01'])(
    'CA-3: %s tiene la forma pero no es un día: el extra no se envía',
    (until) => {
      expect(quotaRequestOf({ extra: '50', until }, TODAY)).toEqual({
        issues: [
          { fieldId: QUOTA_FIELD_IDS.until, message: BACKOFFICE_FIELD_MESSAGES.INVALID_DAY },
        ],
      });
    },
  );

  it.each(['2030-02-30', '2030-11-31'])(
    'CA-7: %s tiene la forma pero no es un día: la vigencia no se envía',
    (day) => {
      expect(validityRequestOf(day, BOUNDS)).toEqual({
        issues: [
          { fieldId: VALIDITY_FIELD_IDS.expiresAt, message: BACKOFFICE_FIELD_MESSAGES.INVALID_DAY },
        ],
      });
    },
  );

  it('CA-6: un día del calendario posterior al último vigente sí se envía', () => {
    expect(validityRequestOf('2030-02-28', BOUNDS)).toEqual({
      request: { expiresAt: '2030-02-28' },
    });
  });
});
