import { Injectable } from '@nestjs/common';

import { Role, TransactionContext } from '../../../../shared';
import type {
  AccountListQuery,
  AccountPage,
  AccountStatistics,
  AccountSummary,
  ClientIdentity,
  IAccountDirectoryRepository,
} from '../../application/ports/i-account-directory.repository.port';
import { AccountStatus } from '../../domain/account-status.enum';
import type { EmailAddress } from '../../domain/email-address.vo';

/** Fila de la lista: `espacio_usado` llega como texto para no perder precisión (`bigint`, ADR-0016). */
interface SummaryRow {
  readonly id: string;
  readonly correo: string;
  readonly nombre: string;
  readonly rol: Role;
  readonly estado: AccountStatus;
  readonly correo_verificado: boolean;
  readonly espacio_usado: string;
  readonly creado_en: Date;
}

interface StatisticsRow {
  readonly total: number;
  readonly clients: number;
  readonly internal: number;
  readonly active: number;
  readonly suspended: number;
  readonly used: string;
}

const SUMMARY_COLUMNS = `id, correo, nombre, rol, estado, correo_verificado, espacio_usado::text AS espacio_usado,
  creado_en`;
/** `$1` nulo no filtra; si no, el correo empieza por el prefijo (comodines escapados, Q-5). */
const PREFIX_FILTER = `($1::text IS NULL OR correo LIKE $1 || '%')`;
const LIST_SQL = `SELECT ${SUMMARY_COLUMNS} FROM usuario WHERE ${PREFIX_FILTER}
  ORDER BY creado_en DESC, id DESC LIMIT $2 OFFSET $3`;
const COUNT_SQL = `SELECT count(*)::int AS total FROM usuario WHERE ${PREFIX_FILTER}`;
const BY_ID_SQL = `SELECT ${SUMMARY_COLUMNS} FROM usuario WHERE id = $1`;
const CLIENT_BY_EMAIL_SQL = `SELECT id, nombre, correo FROM usuario WHERE correo = $1 AND rol = '${Role.CLIENT}'`;
const VERIFIED_CLIENT_IDS_SQL = `SELECT id FROM usuario
  WHERE rol = '${Role.CLIENT}' AND correo_verificado AND ($1::uuid IS NULL OR id > $1::uuid)
  ORDER BY id LIMIT $2`;
const STATISTICS_SQL = `SELECT count(*)::int AS total,
    count(*) FILTER (WHERE rol = '${Role.CLIENT}')::int AS clients,
    count(*) FILTER (WHERE rol <> '${Role.CLIENT}')::int AS internal,
    count(*) FILTER (WHERE estado = '${AccountStatus.ACTIVE}')::int AS active,
    count(*) FILTER (WHERE estado = '${AccountStatus.SUSPENDED}')::int AS suspended,
    COALESCE(sum(espacio_usado), 0)::text AS used
  FROM usuario`;

/** `%`, `_` y la barra invertida: precedidos de la barra, `LIKE` los toma como literales (escape por omisión). */
const LIKE_SPECIALS = /[\\%_]/g;
const escapeLike = (value: string): string => value.replace(LIKE_SPECIALS, (match) => `\\${match}`);

const toSummary = (row: SummaryRow): AccountSummary => ({
  id: row.id,
  email: row.correo,
  fullName: row.nombre,
  role: row.rol,
  status: row.estado,
  emailVerified: row.correo_verificado,
  usedBytes: row.rol === Role.CLIENT ? BigInt(row.espacio_usado) : null,
  createdAt: row.creado_en,
});

const toStatistics = (row: StatisticsRow): AccountStatistics => ({
  total: row.total,
  clients: row.clients,
  internal: row.internal,
  active: row.active,
  suspended: row.suspended,
  usedBytesTotal: BigInt(row.used),
});

/**
 * `IAccountDirectoryRepository` con SQL parametrizado sobre `TransactionContext` (011 plan §2): `usuario` no tiene RLS
 * (sin datos de archivos). Dos consultas por página: con `count(*) OVER ()` una página vacía perdería el total.
 */
@Injectable()
export class TypeOrmAccountDirectoryRepository implements IAccountDirectoryRepository {
  constructor(private readonly context: TransactionContext) {}

  async list(query: AccountListQuery): Promise<AccountPage> {
    const prefix = query.emailPrefix === undefined ? null : escapeLike(query.emailPrefix);
    const offset = (query.page - 1) * query.pageSize;
    const rows = await this.select<SummaryRow>(LIST_SQL, [prefix, query.pageSize, offset]);
    const [count] = await this.select<{ total: number }>(COUNT_SQL, [prefix]);
    return { items: rows.map(toSummary), total: count?.total ?? 0 };
  }

  async findById(id: string): Promise<AccountSummary | null> {
    const [row] = await this.select<SummaryRow>(BY_ID_SQL, [id]);
    return row === undefined ? null : toSummary(row);
  }

  async findClientByEmail(email: EmailAddress): Promise<ClientIdentity | null> {
    const [row] = await this.select<{ id: string; nombre: string; correo: string }>(
      CLIENT_BY_EMAIL_SQL,
      [email.value],
    );
    return row === undefined ? null : { id: row.id, fullName: row.nombre, email: row.correo };
  }

  async statistics(): Promise<AccountStatistics> {
    const [row] = await this.select<StatisticsRow>(STATISTICS_SQL, []);
    return toStatistics(row as StatisticsRow);
  }

  async listVerifiedClientIds(afterId: string | null, limit: number): Promise<readonly string[]> {
    const rows = await this.select<{ id: string }>(VERIFIED_CLIENT_IDS_SQL, [afterId, limit]);
    return rows.map((row) => row.id);
  }

  private async select<T>(sql: string, parameters: unknown[]): Promise<T[]> {
    return (await this.context.manager().query(sql, parameters)) as T[];
  }
}
