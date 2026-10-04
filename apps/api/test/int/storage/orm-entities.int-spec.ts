import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import { UsuarioOrmEntity } from '../../../src/modules/identity/infrastructure/persistence/usuario.orm-entity';
import { AccesoRapidoOrmEntity } from '../../../src/modules/storage/infrastructure/persistence/acceso-rapido.orm-entity';
import { ArchivoOrmEntity } from '../../../src/modules/storage/infrastructure/persistence/archivo.orm-entity';
import { CargaOrmEntity } from '../../../src/modules/storage/infrastructure/persistence/carga.orm-entity';
import { CarpetaOrmEntity } from '../../../src/modules/storage/infrastructure/persistence/carpeta.orm-entity';
import { VersionArchivoOrmEntity } from '../../../src/modules/storage/infrastructure/persistence/version-archivo.orm-entity';
import { connectAsOwner } from '../../support/database-urls';

import { columnsOf, inRolledBackTransaction, insertAccount } from './storage-test-db';

const STORAGE_ENTITIES = [
  ['archivo', ArchivoOrmEntity],
  ['version_archivo', VersionArchivoOrmEntity],
  ['carga', CargaOrmEntity],
  ['carpeta', CarpetaOrmEntity],
  ['acceso_rapido', AccesoRapidoOrmEntity],
] as const;

/** Entidades de 005 y 006 (con accesos rápidos) contra el esquema real que dejan las migraciones (`synchronize: false`). */
describe('entidades ORM de storage (RN-11)', () => {
  let owner: DataSource;

  beforeAll(async () => {
    owner = await connectAsOwner();
  });

  afterAll(async () => {
    await owner.destroy();
  });

  it.each(STORAGE_ENTITIES)(
    'RN-11: la entidad de `%s` mapea exactamente las columnas de la migración',
    async (table, entity) => {
      const mapped = owner
        .getMetadata(entity)
        .columns.map((column) => column.databaseName)
        .sort();

      const actual = await inRolledBackTransaction(owner, (runner) => columnsOf(runner, table));

      expect(mapped).toEqual(Object.keys(actual).sort());
    },
  );

  it.each(STORAGE_ENTITIES)(
    'RN-11: en `%s` toda columna `bigint` se mapea a una propiedad `*Bytes`',
    async (table, entity) => {
      const actual = await inRolledBackTransaction(owner, (runner) => columnsOf(runner, table));
      const bigintColumns = Object.entries(actual)
        .filter(([, column]) => column.type === 'bigint')
        .map(([name]) => name);

      const properties = owner
        .getMetadata(entity)
        .columns.filter((column) => bigintColumns.includes(column.databaseName))
        .map((column) => column.propertyName);

      expect(properties.length).toBe(bigintColumns.length);
      expect(properties.every((name) => name.endsWith('Bytes'))).toBe(true);
    },
  );

  it('RN-11: `tamano_bytes` se lee como `bigint` exacto, más allá de `Number.MAX_SAFE_INTEGER`', async () => {
    const huge = 9_007_199_254_740_993n;

    const loaded = await inRolledBackTransaction(owner, async (runner) => {
      const ownerId = await insertAccount(runner);
      const id = randomUUID();
      await runner.manager.insert(CargaOrmEntity, {
        id,
        propietarioId: ownerId,
        nombre: 'grande.bin',
        conservarAmbos: false,
        tamanoBytes: huge,
        modo: 'simple',
        estado: 'activa',
        motivoRechazo: null,
        archivoId: randomUUID(),
        versionId: randomUUID(),
        claveObjeto: `u/${ownerId}/${randomUUID()}/${randomUUID()}`,
        uploadId: null,
        partesTotales: null,
        tamanoParteBytes: null,
        expiraEn: new Date(),
        creadaEn: new Date(),
        actualizadaEn: new Date(),
        finalizadaEn: null,
      });
      return runner.manager.findOneByOrFail(CargaOrmEntity, { id });
    });

    expect(loaded.tamanoBytes).toBe(huge);
    expect(loaded.tamanoParteBytes).toBeNull();
  });

  it('RN-10: `usuario` expone `espacioUsadoBytes` como `bigint`, de solo lectura para `identity`', async () => {
    const column = owner
      .getMetadata(UsuarioOrmEntity)
      .findColumnWithPropertyName('espacioUsadoBytes');

    const used = await inRolledBackTransaction(owner, async (runner) => {
      const id = await insertAccount(runner);
      return (await runner.manager.findOneByOrFail(UsuarioOrmEntity, { id })).espacioUsadoBytes;
    });

    expect(column?.databaseName).toBe('espacio_usado');
    expect(column?.isInsert).toBe(false);
    expect(column?.isUpdate).toBe(false);
    expect(used).toBe(0n);
  });
});
