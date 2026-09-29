import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DataSource } from 'typeorm';

export const DATABASE_ROLE_REJECTED_MESSAGE =
  'La API debe conectarse como nimbo_app; revisa DATABASE_URL y ejecuta pnpm db:app-role';

/**
 * Atributos del rol de la conexión. `owns_tables` usa `pg_has_role(…, 'USAGE')`: cuenta también la propiedad heredada
 * por pertenencia (p. ej. `GRANT nimbo TO nimbo_app`), que `c.relowner = r.oid` no veía (plan 003 §6.4, §11.5 cambio 4).
 */
const ROLE_ATTRIBUTES_SQL = `SELECT r.rolsuper, r.rolbypassrls,
       EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND pg_has_role(r.oid, c.relowner, 'USAGE')) AS owns_tables
  FROM pg_roles r WHERE r.rolname = current_user`;

interface RoleAttributesRow {
  readonly rolsuper: boolean;
  readonly rolbypassrls: boolean;
  readonly owns_tables: boolean;
}

/** Lo mínimo que `DatabaseRoleCheck` necesita de un logger (permite un doble en las unitarias). */
export interface DatabaseRoleLogger {
  fatal(payload: Record<string, unknown>): void;
}

/**
 * Impide arrancar `api` o `worker` conectados como superusuario, con `BYPASSRLS` o como dueños de las tablas: con
 * ese rol las políticas de RLS no frenan nada (ADR-0005; plan 003 §6.4, DT-4). Aplica en todos los ambientes,
 * incluidas las pruebas. La bitácora lleva solo los tres booleanos, nunca la URL.
 */
@Injectable()
export class DatabaseRoleCheck implements OnApplicationBootstrap {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(PinoLogger) private readonly logger: DatabaseRoleLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const [row] = (await this.dataSource.query(ROLE_ATTRIBUTES_SQL)) as [RoleAttributesRow];
    const flags = {
      superuser: row.rolsuper,
      bypassRls: row.rolbypassrls,
      ownsTables: row.owns_tables,
    };
    if (flags.superuser || flags.bypassRls || flags.ownsTables) {
      this.logger.fatal({ event: 'db.role_rejected', ...flags });
      throw new Error(DATABASE_ROLE_REJECTED_MESSAGE);
    }
  }
}
