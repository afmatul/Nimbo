import type { Role } from '../../../../shared';
import type { AccountStatus } from '../../domain/account-status.enum';
import type { EmailAddress } from '../../domain/email-address.vo';

/** Una cuenta en la lista y en la ficha del backoffice (011 CA-1): sin datos de archivos. */
export interface AccountSummary {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly role: Role;
  readonly status: AccountStatus;
  readonly emailVerified: boolean;
  /** `usuario.espacio_usado` (005, 007); `null` en las internas, que no tienen cuota. */
  readonly usedBytes: bigint | null;
  readonly createdAt: Date;
}

/** Página por número desde 1 (DF-66); `emailPrefix` ya normalizado (Q-5). */
export interface AccountListQuery {
  readonly emailPrefix?: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface AccountPage {
  readonly items: readonly AccountSummary[];
  readonly total: number;
}

/** Lo que Soporte necesita para ubicar al cliente de una consulta de metadatos (011 CA-13). */
export interface ClientIdentity {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
}

/** Totales agregados de `usuario` para el tablero (011 CA-12): nunca filas de una cuenta. */
export interface AccountStatistics {
  readonly total: number;
  readonly clients: number;
  readonly internal: number;
  readonly active: number;
  readonly suspended: number;
  readonly usedBytesTotal: bigint;
}

/**
 * Modelo de lectura de cuentas del backoffice (011 plan §2; Art. V, regla b). Interno a `identity`: lo expone la
 * fachada `AccountDirectory`. Lee con el `EntityManager` de `TransactionContext` (se une a la transacción vigente).
 */
export interface IAccountDirectoryRepository {
  /** Orden `creado_en DESC, id DESC`; el prefijo filtra por el inicio del correo. */
  list(query: AccountListQuery): Promise<AccountPage>;
  findById(id: string): Promise<AccountSummary | null>;
  /** Solo cuentas `CLIENT`: una interna o un correo sin cuenta dan `null` (011 CA-13, 003 D-6). */
  findClientByEmail(email: EmailAddress): Promise<ClientIdentity | null>;
  statistics(): Promise<AccountStatistics>;
}

export const I_ACCOUNT_DIRECTORY_REPOSITORY = Symbol('IAccountDirectoryRepository');
