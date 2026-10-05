import type { AuditEventResponse } from '@nimbo/contracts';

import {
  activityActionLabel,
  activityActorLabel,
  activityResourceLabel,
  ORIGIN_FILTER_LABELS,
  UNKNOWN_ACTIVITY_LABEL,
} from './activity-labels';

const MB = 1_000_000;

function event(overrides: Partial<AuditEventResponse>): AuditEventResponse {
  return {
    id: '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b',
    occurredAt: '2026-10-05T15:15:00.000Z',
    action: 'file.upload_completed',
    origin: 'self',
    actorRole: 'CLIENT',
    resourceType: 'file',
    itemCount: null,
    sizeBytes: null,
    ...overrides,
  };
}

describe('textos de «Mi actividad»', () => {
  it.each([
    ['file.upload_completed', 'file', null, 'Subiste 1 archivo'],
    ['file.upload_rejected', 'upload', null, 'Se rechazó una carga'],
    ['file.download_url_issued', 'file', null, 'Descargaste 1 archivo'],
    ['node.trashed', 'folder', 3, 'Enviaste 3 elementos a la papelera'],
    ['node.restored', 'file', 1, 'Restauraste 1 archivo'],
    ['node.purged', 'folder', 2, 'Eliminaste definitivamente 2 elementos'],
    ['trash.emptied', null, 14, 'Vaciaste la papelera'],
  ] as const)(
    'CA-7: %s hecho por ti se lee en español',
    (action, resourceType, itemCount, text) => {
      expect(activityActionLabel(event({ action, resourceType, itemCount }))).toBe(text);
    },
  );

  it.each([
    ['SUPPORT', 'node.restored', 'Soporte de Nimbo restauró 3 elementos'],
    ['ADMIN', 'node.purged', 'Administración de Nimbo eliminó definitivamente 3 elementos'],
    ['OPERATOR', 'node.trashed', 'Operación de Nimbo envió 3 elementos a la papelera'],
  ] as const)('CA-13: con origen staff el sujeto es el rol (%s)', (actorRole, action, text) => {
    const internal = event({
      action,
      actorRole,
      origin: 'staff',
      resourceType: 'folder',
      itemCount: 3,
    });

    expect(activityActionLabel(internal)).toBe(text);
  });

  it('CA-13: la papelera vaciada por el personal lleva el rol como sujeto', () => {
    const internal = event({ action: 'trash.emptied', actorRole: 'SUPPORT', origin: 'staff' });

    expect(activityActionLabel(internal)).toBe('Soporte de Nimbo vació la papelera');
  });

  it('CA-7: una acción que la web aún no conoce se muestra como «Actividad en tu cuenta»', () => {
    expect(activityActionLabel(event({ action: 'account.quota_adjusted' }))).toBe(
      UNKNOWN_ACTIVITY_LABEL,
    );
    expect(UNKNOWN_ACTIVITY_LABEL).toBe('Actividad en tu cuenta');
  });

  it.each([
    ['self', 'ADMIN', 'Tú'],
    ['staff', 'SUPPORT', 'Soporte de Nimbo'],
    ['staff', 'ADMIN', 'Administración de Nimbo'],
    ['staff', 'OPERATOR', 'Operación de Nimbo'],
    ['staff', 'CLIENT', 'Personal de Nimbo'],
  ] as const)(
    'CA-7: el origen %s con rol %s se rotula sin nombre ni correo',
    (origin, role, text) => {
      expect(activityActorLabel(event({ origin, actorRole: role }))).toBe(text);
    },
  );

  it.each([
    [{ resourceType: 'file', itemCount: null, sizeBytes: 12 * MB }, '1 archivo, 12 MB'],
    [{ resourceType: 'folder', itemCount: 1, sizeBytes: null }, '1 carpeta'],
    [{ resourceType: 'folder', itemCount: 3, sizeBytes: null }, '3 elementos'],
    [{ resourceType: 'upload', itemCount: null, sizeBytes: null }, '1 carga'],
    [{ resourceType: null, itemCount: 14, sizeBytes: 3 * MB }, '14 elementos, 3 MB'],
    [{ resourceType: null, itemCount: null, sizeBytes: null }, 'Cuenta'],
  ] as const)('CA-7: el recurso se describe por tipo y cantidad (%o)', (resource, text) => {
    expect(activityResourceLabel(event(resource))).toBe(text);
  });

  it('CA-10: el filtro de origen es «Todo · Yo · Personal de Nimbo»', () => {
    expect(ORIGIN_FILTER_LABELS).toEqual({ all: 'Todo', self: 'Yo', staff: 'Personal de Nimbo' });
  });
});
