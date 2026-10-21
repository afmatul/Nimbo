import {
  BACKOFFICE_PAGE_SIZE,
  type AccountListItem,
  type AccountListResponse,
} from '@nimbo/contracts';

import { LAURA } from './test-client-files';

/** Clienta de la ficha de los mockups de `backoffice/admin` (plan Equipo); mediodía UTC: el mismo día en América. */
export function accountItem(overrides: Partial<AccountListItem> = {}): AccountListItem {
  return {
    ...LAURA,
    role: 'CLIENT',
    status: 'active',
    emailVerified: true,
    planName: 'Equipo',
    usedBytes: '304000000000',
    createdAt: '2026-09-01T12:00:00.000Z',
    isSelf: false,
    ...overrides,
  };
}

/** Interna de Soporte: sin plan ni espacio (CA-1). */
export const ANDREA = accountItem({
  id: '6d7e8f9a-0b1c-4d2e-9f3a-4b5c6d7e8f9a',
  fullName: 'Andrea Ruiz',
  email: 'andrea.ruiz@nimbo.gt',
  role: 'SUPPORT',
  planName: null,
  usedBytes: null,
  createdAt: '2026-09-28T12:00:00.000Z',
});

/** La Administradora que consulta (CA-4: `isSelf`). */
export const MONICA = accountItem({
  id: '7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b',
  fullName: 'Mónica Herrera',
  email: 'monica.herrera@nimbo.gt',
  role: 'ADMIN',
  planName: null,
  usedBytes: null,
  createdAt: '2026-08-28T12:00:00.000Z',
  isSelf: true,
});

/** Cliente sin suscripción (009): sin plan, pero con su espacio usado. */
export const DIEGO = accountItem({
  id: '8f9a0b1c-2d3e-4f4a-9b5c-6d7e8f9a0b1c',
  fullName: 'Diego Coj',
  email: 'diego.coj@gmail.com',
  emailVerified: false,
  planName: null,
  usedBytes: '0',
  createdAt: '2026-10-02T12:00:00.000Z',
});

/** Una página de `GET /backoffice/accounts`. */
export function accountsPage(
  items: readonly AccountListItem[],
  { page = 1, total = items.length }: { readonly page?: number; readonly total?: number } = {},
): AccountListResponse {
  return { items: [...items], page, pageSize: BACKOFFICE_PAGE_SIZE, total };
}
