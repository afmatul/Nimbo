import { toFieldIssues } from '../validation';

import { AUDIT_ERROR_CODES, AUDIT_FIELD_ISSUE_REASONS } from './error-codes';
import {
  AUDIT_NOTE_MAX_LENGTH,
  AUDIT_ORIGINS,
  AUDIT_PAGE_SIZE,
  AUDIT_TRIGGERS,
} from './parameters';
import {
  auditEventResponseSchema,
  listAuditEventsQuerySchema,
  listAuditEventsResponseSchema,
} from './schemas';

const ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const EARLIER = '2026-10-01T00:00:00.000Z';
const LATER = '2026-10-05T00:00:00.000Z';

const staffEvent = {
  id: ID,
  occurredAt: LATER,
  action: 'node.restored',
  origin: 'staff',
  actorRole: 'SUPPORT',
  resourceType: 'folder',
  itemCount: 3,
  sizeBytes: null,
  note: 'Restauración pedida por el cliente.',
};
const selfEvent = {
  id: ID,
  occurredAt: EARLIER,
  action: 'file.upload_completed',
  origin: 'self',
  actorRole: 'CLIENT',
  resourceType: 'file',
  itemCount: 1,
  sizeBytes: 12_582_912,
};

function reasonsOf(query: Record<string, unknown>): string[] {
  const result = listAuditEventsQuerySchema.safeParse(query);
  if (result.success) return [];
  return toFieldIssues(result.error).map((issue) => issue.reason);
}

describe('parámetros de la bitácora de auditoría', () => {
  it('CA-9: 20 eventos por página; el motivo admite hasta 500 caracteres', () => {
    expect(AUDIT_PAGE_SIZE).toBe(20);
    expect(AUDIT_NOTE_MAX_LENGTH).toBe(500);
  });

  it('CA-10: los orígenes son «Yo» (`self`) y «Personal de Nimbo» (`staff`)', () => {
    expect(AUDIT_ORIGINS).toEqual(['self', 'staff']);
  });

  it('CA-7, 013 CA-18: lo dispara el cliente, el ciclo programado o alguien con el enlace público', () => {
    expect(AUDIT_TRIGGERS).toEqual(['manual', 'scheduled', 'public_link']);
  });

  it('un único código de error con los motivos de campo del plan §4', () => {
    expect(AUDIT_ERROR_CODES).toEqual({ AUDIT_INVALID_QUERY: 'AUDIT_INVALID_QUERY' });
    expect(AUDIT_FIELD_ISSUE_REASONS).toEqual([
      'INVALID_DATE',
      'INVALID_RANGE',
      'INVALID_ORIGIN',
      'INVALID_CURSOR',
    ]);
  });
});

describe('auditEventResponseSchema', () => {
  it('CA-14: un evento del personal lleva rol, recurso, conteo y motivo opcional', () => {
    expect(auditEventResponseSchema.parse(staffEvent)).toEqual(staffEvent);
  });

  it('CA-14: un evento propio sin motivo es válido (`note` ausente)', () => {
    expect(auditEventResponseSchema.parse(selfEvent)).toEqual(selfEvent);
  });

  it.each([
    ['nombre de archivo', { fileName: 'informe.docx' }],
    ['id del actor', { actorId: ID }],
    ['correo del actor', { actorEmail: 'soporte@nimbo.app' }],
    ['nombre del actor', { actorName: 'Ana' }],
    ['URL', { url: 'https://x' }],
  ])('CA-14: rechaza un campo extra (%s)', (_label, extra) => {
    expect(auditEventResponseSchema.safeParse({ ...selfEvent, ...extra }).success).toBe(false);
  });

  it('CA-14: rechaza un motivo de más de 500 caracteres', () => {
    const note = 'a'.repeat(AUDIT_NOTE_MAX_LENGTH + 1);

    expect(auditEventResponseSchema.safeParse({ ...staffEvent, note }).success).toBe(false);
  });

  it.each(['manual', 'scheduled'])('CA-7: una purga admite `trigger` `%s`', (trigger) => {
    const purge = { ...selfEvent, action: 'node.purged', trigger };

    expect(auditEventResponseSchema.parse(purge)).toEqual(purge);
  });

  it('013 CA-18: una descarga por enlace público lleva `trigger` `public_link`', () => {
    const download = { ...selfEvent, action: 'public_link.downloaded', trigger: 'public_link' };

    expect(auditEventResponseSchema.parse(download)).toEqual(download);
  });

  it('CA-7: rechaza un `trigger` fuera de `manual`, `scheduled` y `public_link`', () => {
    const purge = { ...selfEvent, action: 'node.purged', trigger: 'system' };

    expect(auditEventResponseSchema.safeParse(purge).success).toBe(false);
  });

  it('CA-10: rechaza un origen fuera de `self` y `staff`', () => {
    expect(auditEventResponseSchema.safeParse({ ...selfEvent, origin: 'system' }).success).toBe(
      false,
    );
  });
});

describe('listAuditEventsResponseSchema', () => {
  it('CA-9: la página es `{ items, nextCursor }`; `nextCursor` es `null` al final', () => {
    const page = { items: [staffEvent, selfEvent], nextCursor: 'abc' };

    expect(listAuditEventsResponseSchema.parse(page)).toEqual(page);
    expect(listAuditEventsResponseSchema.parse({ items: [], nextCursor: null }).items).toEqual([]);
  });

  it('CA-9: rechaza un campo extra en la página', () => {
    const page = { items: [], nextCursor: null, total: 0 };

    expect(listAuditEventsResponseSchema.safeParse(page).success).toBe(false);
  });
});

describe('listAuditEventsQuerySchema', () => {
  it('CA-9, CA-10: acepta fechas ISO, origen y cursor; todos son opcionales', () => {
    const query = { from: EARLIER, to: LATER, origin: 'staff', cursor: 'abc' };

    expect(listAuditEventsQuerySchema.parse(query)).toEqual(query);
    expect(listAuditEventsQuerySchema.parse({})).toEqual({});
  });

  it('CA-10: una fecha que no es ISO 8601 es `INVALID_DATE`', () => {
    expect(reasonsOf({ from: 'ayer', to: '05/10/2026' })).toEqual(['INVALID_DATE', 'INVALID_DATE']);
  });

  it.each([LATER, '2026-10-06T00:00:00.000Z'])(
    'CA-10: `to` no posterior a `from` es `INVALID_RANGE` (from %s)',
    (from) => {
      expect(reasonsOf({ from, to: LATER })).toEqual(['INVALID_RANGE']);
    },
  );

  it('CA-10: un origen desconocido es `INVALID_ORIGIN`', () => {
    expect(reasonsOf({ origin: 'system' })).toEqual(['INVALID_ORIGIN']);
  });

  it('CA-9: un cursor vacío es `INVALID_CURSOR`', () => {
    expect(reasonsOf({ cursor: '' })).toEqual(['INVALID_CURSOR']);
  });
});
