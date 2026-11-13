import { randomUUID } from 'node:crypto';

import type { DataSource, EntityManager } from 'typeorm';

import type { Actor } from '../../../src/shared';
import { createActor, Role } from '../../../src/shared';
import { TransactionContext } from '../../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../../src/shared/infrastructure/persistence/typeorm-transaction-runner';
import { startRestrictedOwnerDatabase } from '../../isolation/setup/nosuperuser-postgres';
import type { RestrictedOwnerDatabase } from '../../isolation/setup/nosuperuser-postgres';
import { connectTo } from '../../support/database-urls';
import { revertFrom } from '../billing/billing-test-db';
import { insertAccount, insertFileWithVersion, insertFolder } from '../storage/storage-test-db';

import { insertShare } from './sharing-test-db';

const MIGRATION = 'AuditoriaAlSalirDeComparticion20261101100300';
const POLICY = 'evento_auditoria_salir_comparticion';
/** Las migraciones que la siguen: `revertFrom` también las revierte. */
const NEXT_MIGRATIONS = [
  'CarpetaDelMismoPropietario20261101100400',
  'CrearEnlacePublico20261102100000',
  'CorregirLimitesDePlanesAUnidadesDecimales20261104100000',
  'UnaSesionActivaPorDispositivo20261104100100',
  'AgregarPlanPendienteAUsuario20261113100000',
];

/** Lo que el caso de uso de Salir escribe (CA-23, S-8); cada prueba cambia solo lo que quiere falsear. */
interface LeaveEvent {
  readonly action?: string;
  readonly targetUserId: string;
  readonly resourceType?: string;
  readonly resourceId: string;
  readonly attributes?: Record<string, unknown>;
  readonly occurredAt?: Date;
}

const INSERT_EVENT_SQL = `INSERT INTO evento_auditoria
    (id, accion, actor_id, rol_actor, usuario_afectado_id, tipo_recurso, recurso_id, atributos, ocurrido_en)
  VALUES ($1, $2, nimbo_actor_id(), 'CLIENT', $3, $4, $5, $6::jsonb, $7)`;

/**
 * Política de auditoría de Salir (spec 012 CA-23, S-8) con un dueño **sin** `SUPERUSER` (ADR-0021): el destinatario
 * escribe `share.revoked` en la actividad del propietario solo mientras existe su compartición de ese nodo; nadie más,
 * ni con otra acción, otro nodo u otro afectado.
 */
describe('migración auditoria-al-salir-de-comparticion con dueño NOSUPERUSER (plan 012 §5)', () => {
  let database: RestrictedOwnerDatabase;
  let owner: DataSource;
  let app: DataSource;
  let transactions: TypeOrmTransactionRunner;
  let context: TransactionContext;
  let ana: Actor;
  let bruno: Actor;
  let carla: Actor;
  const nodes = { file: '', folder: '', other: '' };

  const asActor = <T>(actor: Actor, work: (manager: EntityManager) => Promise<T>): Promise<T> =>
    transactions.withActor(actor, () => work(context.requireActorScope(actor)));

  const newClient = async (): Promise<Actor> =>
    createActor(await insertAccount(owner, Role.CLIENT), Role.CLIENT);

  const writeAs = (actor: Actor, event: LeaveEvent): Promise<unknown> =>
    asActor(actor, (manager) =>
      manager.query(INSERT_EVENT_SQL, [
        randomUUID(),
        event.action ?? 'share.revoked',
        event.targetUserId,
        event.resourceType ?? 'file',
        event.resourceId,
        JSON.stringify(
          event.attributes ?? { nodeType: event.resourceType ?? 'file', level: 'VIEWER' },
        ),
        event.occurredAt ?? new Date(),
      ]),
    );

  const leaveEventOf = (resourceId: string): LeaveEvent => ({ targetUserId: ana.id, resourceId });

  beforeAll(async () => {
    database = await startRestrictedOwnerDatabase();
    owner = await connectTo(database.ownerUrl);
    app = await connectTo(database.appUrl);
    context = new TransactionContext(app);
    transactions = new TypeOrmTransactionRunner(app, context);
    [ana, bruno, carla] = [await newClient(), await newClient(), await newClient()];
    await asActor(ana, async (manager) => {
      nodes.file = (await insertFileWithVersion(manager, ana.id)).fileId;
      nodes.other = (await insertFileWithVersion(manager, ana.id)).fileId;
      nodes.folder = (await insertFolder(manager, ana.id)).id;
      await insertShare(manager, {
        ownerId: ana.id,
        granteeId: bruno.id,
        node: { fileId: nodes.file },
      });
      await insertShare(manager, {
        ownerId: ana.id,
        granteeId: bruno.id,
        node: { folderId: nodes.folder },
      });
    });
  });

  afterAll(async () => {
    await app?.destroy();
    await owner?.destroy();
    await database?.stop();
  });

  it('RNF-10: up → down → up: el `down` quita la política y el `up` la devuelve', async () => {
    const policies = async (): Promise<string[]> =>
      (
        (await owner.query(
          "SELECT policyname FROM pg_policies WHERE tablename = 'evento_auditoria' ORDER BY policyname",
        )) as { policyname: string }[]
      ).map((row) => row.policyname);
    const before = await policies();

    expect(await revertFrom(owner, MIGRATION)).toEqual([MIGRATION, ...NEXT_MIGRATIONS]);
    const afterDown = await policies();
    await owner.runMigrations({ transaction: 'each' });

    expect(before).toContain(POLICY);
    expect(afterDown).not.toContain(POLICY);
    expect(await policies()).toEqual(before);
  });

  it('CA-23: el destinatario escribe `share.revoked` de su archivo o carpeta compartida en la actividad de la propietaria', async () => {
    await expect(writeAs(bruno, leaveEventOf(nodes.file))).resolves.toBeDefined();
    await expect(
      writeAs(bruno, { ...leaveEventOf(nodes.folder), resourceType: 'folder' }),
    ).resolves.toBeDefined();
  });

  it('RNF-05: sin compartición (un tercero, otro nodo o el tipo cambiado) la política lo rechaza', async () => {
    const forged: [Actor, LeaveEvent][] = [
      [carla, leaveEventOf(nodes.file)],
      [bruno, leaveEventOf(nodes.other)],
      [bruno, { ...leaveEventOf(nodes.folder), resourceType: 'file' }],
      [bruno, { targetUserId: carla.id, resourceId: nodes.file }],
    ];
    for (const [actor, event] of forged) {
      await expect(writeAs(actor, event)).rejects.toThrow(/row-level security/);
    }
  });

  it('RNF-05: solo `share.revoked`; otra acción sobre la actividad de la propietaria se rechaza', async () => {
    for (const action of ['share.granted', 'file.download_url_issued']) {
      await expect(writeAs(bruno, { ...leaveEventOf(nodes.file), action })).rejects.toThrow(
        /row-level security/,
      );
    }
  });

  it('RNF-05 (SEC-3): solo el evento exacto: sin atributos de más, con el nivel de la compartición y la fecha de ahora', async () => {
    const minutes = (n: number): Date => new Date(Date.now() + n * 60_000);
    const forged: Partial<LeaveEvent>[] = [
      { attributes: {} },
      { attributes: { nodeType: 'file', level: 'VIEWER', nota: 'Llama al 555-0100' } },
      { attributes: { nodeType: 'file', level: 'EDITOR' } },
      { attributes: { nodeType: 'folder', level: 'VIEWER' } },
      { occurredAt: new Date('2020-01-01T00:00:00.000Z') },
      { occurredAt: minutes(-10) },
      { occurredAt: minutes(10) },
    ];
    for (const change of forged) {
      await expect(writeAs(bruno, { ...leaveEventOf(nodes.file), ...change })).rejects.toThrow(
        /row-level security/,
      );
    }
  });

  it('CA-23: borrada la compartición, el destinatario ya no puede escribir el evento', async () => {
    await asActor(bruno, (manager) =>
      manager.query('DELETE FROM comparticion WHERE destinatario_id = $1 AND archivo_id = $2', [
        bruno.id,
        nodes.file,
      ]),
    );

    await expect(writeAs(bruno, leaveEventOf(nodes.file))).rejects.toThrow(/row-level security/);
  });
});
