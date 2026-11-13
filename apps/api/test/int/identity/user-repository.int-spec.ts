import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { DataSource } from 'typeorm';

import { aClientUser } from '../../../src/modules/identity/application/testing/client-user.builder';
import { AccountStatus } from '../../../src/modules/identity/domain/account-status.enum';
import { ClientUser } from '../../../src/modules/identity/domain/client-user.entity';
import { EmailAddress } from '../../../src/modules/identity/domain/email-address.vo';
import { EmployeeCode } from '../../../src/modules/identity/domain/employee-code.vo';
import { InternalUser } from '../../../src/modules/identity/domain/internal-user.entity';
import { LegalAcceptance } from '../../../src/modules/identity/domain/legal-acceptance.vo';
import { TypeormUserRepository } from '../../../src/modules/identity/infrastructure/persistence/typeorm-user.repository';
import { UsuarioOrmEntity } from '../../../src/modules/identity/infrastructure/persistence/usuario.orm-entity';
import { PasswordHash, buildDataSourceOptions } from '../../../src/shared';
import { Role } from '../../../src/shared/domain/role.enum';
import { TransactionContext } from '../../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../../src/shared/infrastructure/persistence/typeorm-transaction-runner';
import { uniqueEmployeeCode } from '../../support/employee-codes';

/** Tiempo que una transacción retiene el bloqueo para que la otra tenga que esperarla. */
const HOLD_MS = 300;
const INTERNAL_PHC = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aW50ZXJuYQ';

interface UserRow {
  nombre: string;
  hash_clave: string;
  correo_verificado: boolean;
  version_terminos: string | null;
  version_privacidad: string | null;
  terminos_aceptados_en: Date | null;
  plan_pendiente_slug: string | null;
}

const uniqueEmail = (): string => `ana-${randomUUID()}@nimbo.me`;

/** Aviso de una transacción a la otra: fija el orden sin depender de un `sleep`. */
const signal = (): { fire: () => void; fired: Promise<void> } => {
  let fire = (): void => undefined;
  const fired = new Promise<void>((resolve) => {
    fire = resolve;
  });
  return { fire, fired };
};

/** `TypeormUserRepository` sobre Postgres real, con las migraciones del arnés (plan §6.4, CA-3, CA-19). */
describe('TypeormUserRepository (CA-3, CA-19)', () => {
  let dataSource: DataSource;
  let runner: TypeOrmTransactionRunner;
  let repository: TypeormUserRepository;

  const readRow = async (id: string): Promise<UserRow | undefined> => {
    const rows = (await dataSource.query(
      `SELECT nombre, hash_clave, correo_verificado, version_terminos, version_privacidad, terminos_aceptados_en,
              plan_pendiente_slug
         FROM usuario WHERE id = $1`,
      [id],
    )) as UserRow[];
    return rows[0];
  };

  const insertInternal = async (email: string): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO usuario (id, nombre, correo, hash_clave, rol, codigo_empleado)
       VALUES ($1, 'Soporte Nimbo', $2, $3, 'SUPPORT', $4)`,
      [id, email, INTERNAL_PHC, uniqueEmployeeCode()],
    );
    return id;
  };

  beforeAll(async () => {
    dataSource = new DataSource({
      ...buildDataSourceOptions({ DATABASE_URL: process.env['DATABASE_URL'] ?? '' }),
      entities: [UsuarioOrmEntity],
    });
    await dataSource.initialize();
    const context = new TransactionContext(dataSource);
    runner = new TypeOrmTransactionRunner(dataSource, context);
    repository = new TypeormUserRepository(context);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('CA-3: `insertIfAbsent` guarda un cliente y `findByEmail` lo devuelve como `ClientUser`', async () => {
    const user = aClientUser().withId(randomUUID()).withEmail(uniqueEmail()).build();

    await expect(runner.run(() => repository.insertIfAbsent(user))).resolves.toBe(true);
    const found = await repository.findByEmail(user.email);

    expect(found).toBeInstanceOf(ClientUser);
    expect(found).toMatchObject({
      id: user.id,
      fullName: user.fullName,
      role: Role.CLIENT,
      emailVerified: false,
    });
    expect((found as ClientUser).acceptance).toEqual(user.acceptance);
    expect(found?.passwordHash.reveal()).toBe(user.passwordHash.reveal());
  });

  it('CA-3: una cuenta interna se lee como `InternalUser` con su rol', async () => {
    const email = uniqueEmail();
    const id = await insertInternal(email);

    const found = await repository.findByEmail(EmailAddress.of(email));

    expect(found).toBeInstanceOf(InternalUser);
    expect(found).toMatchObject({ id, role: Role.SUPPORT });
  });

  it('CA-3: `findByIdForUpdate` devuelve la cuenta, o `null` si no existe', async () => {
    const user = aClientUser().withId(randomUUID()).withEmail(uniqueEmail()).build();
    await runner.run(() => repository.insertIfAbsent(user));

    const found = await runner.run(() => repository.findByIdForUpdate(user.id));
    const missing = await runner.run(() => repository.findByIdForUpdate(randomUUID()));

    expect(found?.id).toBe(user.id);
    expect(missing).toBeNull();
  });

  it('002 CA-19: `findById` devuelve la cuenta sin bloquearla, o `null` si no existe', async () => {
    const id = await insertInternal(uniqueEmail());

    const found = await repository.findById(id);
    const missing = await repository.findById(randomUUID());

    expect(found).toBeInstanceOf(InternalUser);
    expect(found?.id).toBe(id);
    expect(missing).toBeNull();
  });

  it('002 CA-19: `updatePasswordHash` solo cambia el hash, también de una cuenta interna', async () => {
    const client = aClientUser().withId(randomUUID()).withEmail(uniqueEmail()).build();
    await runner.run(() => repository.insertIfAbsent(client));
    const internalId = await insertInternal(uniqueEmail());
    const before = await readRow(client.id);
    const newHash = PasswordHash.fromPhc('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$bnVldmE');

    await runner.run(async () => {
      await repository.updatePasswordHash(client.id, newHash);
      await repository.updatePasswordHash(internalId, newHash);
    });

    expect(await readRow(client.id)).toEqual({ ...before, hash_clave: newHash.reveal() });
    expect((await readRow(internalId))?.hash_clave).toBe(newHash.reveal());
  });

  it('CA-3: `findByEmailForUpdate` bloquea la fila: una segunda transacción espera al commit de la primera', async () => {
    const user = aClientUser().withId(randomUUID()).withEmail(uniqueEmail()).build();
    await runner.run(() => repository.insertIfAbsent(user));
    const timeline: string[] = [];
    const locked = signal();

    const first = runner.run(async () => {
      await repository.findByEmailForUpdate(user.email);
      timeline.push('first:locked');
      locked.fire();
      await sleep(HOLD_MS);
      timeline.push('first:commit');
    });
    await locked.fired;
    const second = runner.run(async () => {
      await repository.findByEmailForUpdate(user.email);
      timeline.push('second:locked');
    });
    await Promise.all([first, second]);

    expect(timeline).toEqual(['first:locked', 'first:commit', 'second:locked']);
  });

  it('CA-3: dos `insertIfAbsent` concurrentes dejan una fila; el perdedor relee la cuenta en su transacción sin abortarla', async () => {
    const email = uniqueEmail();
    const winner = aClientUser().withId(randomUUID()).withEmail(email).build();
    const loser = aClientUser().withId(randomUUID()).withEmail(email).build();

    const insertedFirst = signal();

    const first = runner.run(async () => {
      const inserted = await repository.insertIfAbsent(winner);
      insertedFirst.fire();
      await sleep(HOLD_MS);
      return inserted;
    });
    await insertedFirst.fired;
    const second = runner.run(async () => {
      const inserted = await repository.insertIfAbsent(loser);
      const reread = await repository.findByEmailForUpdate(loser.email);
      return { inserted, rereadId: reread?.id };
    });

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toEqual({ inserted: false, rereadId: winner.id });
    const rows = (await dataSource.query('SELECT id FROM usuario WHERE correo = $1', [email])) as {
      id: string;
    }[];
    expect(rows).toEqual([{ id: winner.id }]);
  });

  it('CA-3: `update` escribe nombre, hash, aceptación, `correo_verificado` y el plan pendiente', async () => {
    const user = aClientUser().withId(randomUUID()).withEmail(uniqueEmail()).build();
    await runner.run(() => repository.insertIfAbsent(user));
    const acceptedAt = new Date('2026-10-01T09:30:00.000Z');
    const replaced = user
      .replacePendingRegistration({
        fullName: 'Ana María López',
        passwordHash: PasswordHash.fromPhc('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$bnVldm8'),
        acceptance: LegalAcceptance.of({ termsVersion: '1.1', privacyVersion: '1.2', acceptedAt }),
        pendingPlanSlug: 'pro',
      })
      .verifyEmail();

    await runner.run(() => repository.update(replaced));

    await expect(readRow(user.id)).resolves.toEqual({
      nombre: 'Ana María López',
      hash_clave: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$bnVldm8',
      correo_verificado: true,
      version_terminos: '1.1',
      version_privacidad: '1.2',
      terminos_aceptados_en: acceptedAt,
      plan_pendiente_slug: 'pro',
    });
  });

  it('registro con plan: `insertIfAbsent` guarda el plan pendiente y `clearPendingPlan` lo descarta', async () => {
    const user = aClientUser()
      .withId(randomUUID())
      .withEmail(uniqueEmail())
      .withPendingPlan('pro')
      .build();
    await runner.run(() => repository.insertIfAbsent(user));
    const before = await readRow(user.id);

    await runner.run(() => repository.clearPendingPlan(user.id));

    expect(before?.plan_pendiente_slug).toBe('pro');
    expect(await readRow(user.id)).toEqual({ ...before, plan_pendiente_slug: null });
    expect(((await repository.findById(user.id)) as ClientUser).pendingPlanSlug).toBeNull();
  });

  it('CA-3: escribe con el `EntityManager` de la transacción en curso: si la transacción falla, no queda la fila', async () => {
    const user = aClientUser().withId(randomUUID()).withEmail(uniqueEmail()).build();

    await expect(
      runner.run(async () => {
        await repository.insertIfAbsent(user);
        throw new Error('fallo a propósito');
      }),
    ).rejects.toThrow('fallo a propósito');

    await expect(readRow(user.id)).resolves.toBeUndefined();
  });

  it('CA-19: la cuenta leída no expone el hash al serializarse', async () => {
    const user = aClientUser().withId(randomUUID()).withEmail(uniqueEmail()).build();
    await runner.run(() => repository.insertIfAbsent(user));

    const found = await repository.findByEmail(user.email);

    expect(JSON.stringify(found)).not.toContain(user.passwordHash.reveal());
  });

  describe('cuentas internas (011 plan §2)', () => {
    const anInternal = (patch: { email?: string; code?: string; role?: Role } = {}): InternalUser =>
      InternalUser.enroll({
        id: randomUUID(),
        fullName: 'Marta Ruiz',
        email: EmailAddress.of(patch.email ?? uniqueEmail()),
        employeeCode: EmployeeCode.of(patch.code ?? uniqueEmployeeCode()),
        role: patch.role ?? Role.SUPPORT,
        passwordHash: PasswordHash.fromPhc(INTERNAL_PHC),
      });

    const insertInternalUser = (user: InternalUser): Promise<boolean> =>
      runner.run(() => repository.insertInternalIfAbsent(user));

    it('CA-5: `insertInternalIfAbsent` guarda la interna activa, verificada y con su código', async () => {
      const user = anInternal({ code: ` ${uniqueEmployeeCode().toLowerCase()} ` });

      await expect(insertInternalUser(user)).resolves.toBe(true);
      const found = await repository.findById(user.id);

      expect(found).toBeInstanceOf(InternalUser);
      expect(found).toMatchObject({
        role: Role.SUPPORT,
        status: AccountStatus.ACTIVE,
        emailVerified: true,
      });
      expect((found as InternalUser).employeeCode).toEqual(user.employeeCode);
    });

    it('CA-6: con un correo o un código ya usados devuelve `false` y no inserta', async () => {
      const first = anInternal();
      await insertInternalUser(first);
      const sameEmail = anInternal({ email: first.email.value });
      const sameCode = anInternal({ code: first.employeeCode.value });

      await expect(insertInternalUser(sameEmail)).resolves.toBe(false);
      await expect(insertInternalUser(sameCode)).resolves.toBe(false);
      await expect(repository.findById(sameEmail.id)).resolves.toBeNull();
      await expect(repository.findById(sameCode.id)).resolves.toBeNull();
    });

    it('CA-6: `findByEmployeeCode` encuentra la interna por su código, o `null`', async () => {
      const user = anInternal();
      await insertInternalUser(user);

      const found = await repository.findByEmployeeCode(user.employeeCode);
      const missing = await repository.findByEmployeeCode(EmployeeCode.of(uniqueEmployeeCode()));

      expect(found?.id).toBe(user.id);
      expect(missing).toBeNull();
    });

    it('CA-2, CA-3: `updateStatus` cambia solo el estado y `statusOf` lo lee (o `null` si no existe)', async () => {
      const user = anInternal();
      await insertInternalUser(user);

      await runner.run(() => repository.updateStatus(user.id, AccountStatus.SUSPENDED));

      await expect(repository.statusOf(user.id)).resolves.toBe(AccountStatus.SUSPENDED);
      await expect(repository.statusOf(randomUUID())).resolves.toBeNull();
      await expect(repository.findById(user.id)).resolves.toMatchObject({
        fullName: user.fullName,
        employeeCode: user.employeeCode,
      });
    });

    it('RN-7: `countActiveAdmins` cuenta solo Administradores activos', async () => {
      const before = await repository.countActiveAdmins();
      const active = anInternal({ role: Role.ADMIN });
      const suspended = anInternal({ role: Role.ADMIN });
      await insertInternalUser(active);
      await insertInternalUser(suspended);
      await insertInternalUser(anInternal({ role: Role.SUPPORT }));
      await runner.run(() => repository.updateStatus(suspended.id, AccountStatus.SUSPENDED));

      await expect(repository.countActiveAdmins()).resolves.toBe(before + 1);
    });

    it('RN-7: `lockAdminRoster` serializa: una segunda transacción espera al commit de la primera', async () => {
      const timeline: string[] = [];
      const locked = signal();

      const first = runner.run(async () => {
        await repository.lockAdminRoster();
        timeline.push('first:locked');
        locked.fire();
        await sleep(HOLD_MS);
        timeline.push('first:commit');
      });
      await locked.fired;
      const second = runner.run(async () => {
        await repository.lockAdminRoster();
        timeline.push('second:locked');
      });
      await Promise.all([first, second]);

      expect(timeline).toEqual(['first:locked', 'first:commit', 'second:locked']);
    });

    it('RN-7: `lockAdminRoster` es reentrante en la misma transacción y exige una transacción', async () => {
      await expect(
        runner.run(async () => {
          await repository.lockAdminRoster();
          await repository.lockAdminRoster();
          return 'ok';
        }),
      ).resolves.toBe('ok');
      await expect(repository.lockAdminRoster()).rejects.toThrow(/transacción/);
    });
  });
});
