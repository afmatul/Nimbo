import { randomUUID } from 'node:crypto';

import { LEGAL_DOCUMENTS } from '@nimbo/contracts';
import type { DataSource } from 'typeorm';

import { FixedClock, Role } from '../../../src/shared';
import { createTestApp } from '../../int/setup/test-app';
import type { TestApp, TestAppOptions } from '../../int/setup/test-app';
import { connectAsOwner, requiredEnv } from '../../support/database-urls';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TestAccessTokens } from '../../support/test-access-tokens';

/** Nombre visible por defecto; los dos clientes del mundo lo comparten (plan 003 §6.7). */
const DEFAULT_NAME = 'Ana López';
/** Misma fecha de alta y de aceptación para todas las cuentas: nada las distingue salvo `id` y correo. */
const WORLD_CREATED_AT = new Date('2026-09-01T09:00:00.000Z');
/** PHC de relleno: nadie inicia sesión con estas cuentas; `tokenFor` emite sus tokens. */
const PLACEHOLDER_PHC = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdGVuaXNv$aXNvbGF0aW9u';

export type InternalRole = Exclude<Role, Role.CLIENT>;

export interface WorldAccount {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
}

/** *Builder* de cuentas del mundo (`conventions.md`): `aClient().named('Ana López').build()`. */
export class AccountBuilder {
  private name = DEFAULT_NAME;
  private email: string | undefined;

  constructor(private readonly role: Role) {}

  named(name: string): this {
    this.name = name;
    return this;
  }

  withEmail(email: string): this {
    this.email = email;
    return this;
  }

  build(): WorldAccount {
    const id = randomUUID();
    return Object.freeze({
      id,
      name: this.name,
      email: this.email ?? `${this.role.toLowerCase()}.${id}@ejemplo.com`,
      role: this.role,
    });
  }
}

export const aClient = (): AccountBuilder => new AccountBuilder(Role.CLIENT);

export const anInternal = (role: InternalRole): AccountBuilder => new AccountBuilder(role);

export interface IsolationWorld {
  /** Dos clientes casi idénticos: mismo nombre, estado y fechas; correos que difieren en un carácter. */
  readonly clients: readonly [WorldAccount, WorldAccount];
  readonly internals: Readonly<Record<InternalRole, WorldAccount>>;
  /** Token de acceso de prueba de la cuenta (002-PR-2 lo cambia por uno real). */
  tokenFor(account: WorldAccount): string;
  /** App de Nest conectada como `nimbo_app`, nunca como el dueño (`DatabaseRoleCheck` lo impide). */
  appAs(options?: Omit<TestAppOptions, 'env'>): Promise<TestApp>;
  /** Borra las cuentas del mundo (como el dueño) y cierra su conexión. */
  close(): Promise<void>;
}

const insertAccount = async (owner: DataSource, account: WorldAccount): Promise<void> => {
  const isClient = account.role === Role.CLIENT;
  await owner.query(
    `INSERT INTO usuario (id, nombre, correo, hash_clave, rol, correo_verificado, version_terminos,
                          version_privacidad, terminos_aceptados_en, creado_en)
     VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9)`,
    [
      account.id,
      account.name,
      account.email,
      PLACEHOLDER_PHC,
      account.role,
      isClient ? LEGAL_DOCUMENTS.terms.version : null,
      isClient ? LEGAL_DOCUMENTS.privacy.version : null,
      isClient ? WORLD_CREATED_AT : null,
      WORLD_CREATED_AT,
    ],
  );
};

/** Correos de igual longitud que difieren en un solo carácter (`z`/`s`), únicos por mundo. */
const nearlyIdenticalEmails = (): readonly [string, string] => {
  const tag = randomUUID();
  return [`ana.lopez.${tag}@ejemplo.com`, `ana.lopes.${tag}@ejemplo.com`];
};

/**
 * Mundo de aislamiento (003 CA-15, D-3; plan §6.7). Las cuentas se insertan con el rol **dueño**
 * (`DATABASE_MIGRATION_URL`) porque son *fixtures*, no la aplicación; la app corre como `nimbo_app`. 005 agrega
 * `.withFiles(...)` al *builder*.
 */
export const createIsolationWorld = async (): Promise<IsolationWorld> => {
  const owner = await connectAsOwner();
  const [firstEmail, secondEmail] = nearlyIdenticalEmails();
  const clients = [
    aClient().withEmail(firstEmail).build(),
    aClient().withEmail(secondEmail).build(),
  ] as const;
  const internals = {
    [Role.ADMIN]: anInternal(Role.ADMIN).build(),
    [Role.SUPPORT]: anInternal(Role.SUPPORT).build(),
    [Role.OPERATOR]: anInternal(Role.OPERATOR).build(),
  };
  const accounts = [...clients, ...Object.values(internals)];
  for (const account of accounts) {
    await insertAccount(owner, account);
  }
  const tokens = new TestAccessTokens(new FixedClock(PROBE_CLOCK_START));

  return {
    clients,
    internals,
    tokenFor: (account) =>
      tokens.valid({ userId: account.id, role: account.role, sessionId: randomUUID() }),
    appAs: (options = {}) =>
      createTestApp({ ...options, env: { DATABASE_URL: requiredEnv('DATABASE_URL') } }),
    close: async () => {
      await owner.query('DELETE FROM usuario WHERE id = ANY($1)', [
        accounts.map((account) => account.id),
      ]);
      await owner.destroy();
    },
  };
};
