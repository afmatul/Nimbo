import { BACKOFFICE_PAGE_SIZE } from '@nimbo/contracts';
import type { AccountListItem, AccountListResponse, AccountStatusName } from '@nimbo/contracts';

import type { AccountDetail, AccountDetailPage } from '../application/admin.service';

/** `usuario.estado` (E-R, en español) → estado del contrato. */
const STATUS_NAMES: Readonly<Record<AccountDetail['status'], AccountStatusName>> = {
  activa: 'active',
  suspendida: 'suspended',
};

/** Lista blanca (011 CA-1): solo estos campos salen, sin datos de archivos; bytes como texto decimal (ADR-0016). */
export const toAccountListItem = (account: AccountDetail): AccountListItem => ({
  id: account.id,
  email: account.email,
  fullName: account.fullName,
  role: account.role,
  status: STATUS_NAMES[account.status],
  emailVerified: account.emailVerified,
  planName: account.planName,
  usedBytes: account.usedBytes?.toString() ?? null,
  createdAt: account.createdAt.toISOString(),
  isSelf: account.isSelf,
});

/** `GET /backoffice/accounts`: una página de cuentas con el total de la búsqueda (DF-66). */
export const toAccountListResponse = (page: AccountDetailPage): AccountListResponse => ({
  items: page.items.map(toAccountListItem),
  page: page.page,
  pageSize: BACKOFFICE_PAGE_SIZE,
  total: page.total,
});
