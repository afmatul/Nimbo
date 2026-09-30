import type { DataSource } from 'typeorm';

import { AgregarEspacioUsadoAUsuario20260930100000 } from '../../../src/migrations/20260930100000-agregar-espacio-usado-a-usuario';
import { connectAsOwner } from '../../support/database-urls';

import { columnsOf, inRolledBackTransaction, insertAccount } from './storage-test-db';

/**
 * Migraciones de 005 (plan §4) sobre el Postgres del arnés, como el dueño de las tablas. Cada caso corre en una
 * transacción que se revierte: el esquema compartido no cambia.
 */
let owner: DataSource;

beforeAll(async () => {
  owner = await connectAsOwner();
});

afterAll(async () => {
  await owner.destroy();
});

describe('migración agregar-espacio-usado-a-usuario (CA-4, RN-10)', () => {
  it('CA-4: `usuario.espacio_usado` es `bigint NOT NULL DEFAULT 0` y una cuenta nueva empieza en 0', async () => {
    const [column, used] = await inRolledBackTransaction(owner, async (runner) => {
      const id = await insertAccount(runner);
      const [row] = (await runner.query('SELECT espacio_usado FROM usuario WHERE id = $1', [
        id,
      ])) as {
        espacio_usado: string;
      }[];
      return [(await columnsOf(runner, 'usuario'))['espacio_usado'], row?.espacio_usado];
    });

    expect(column).toEqual({ type: 'bigint', nullable: false, default: '0' });
    expect(used).toBe('0');
  });

  it('RN-10: `ck_usuario_espacio_usado` rechaza un espacio usado negativo', async () => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const id = await insertAccount(runner);
        await runner.query('UPDATE usuario SET espacio_usado = -1 WHERE id = $1', [id]);
      }),
    ).rejects.toThrow(/ck_usuario_espacio_usado/);
  });

  it('RN-10: el `down` quita la restricción y la columna, y el `up` las devuelve', async () => {
    const migration = new AgregarEspacioUsadoAUsuario20260930100000();

    const [afterDown, afterUp] = await inRolledBackTransaction(owner, async (runner) => {
      await migration.down(runner);
      const down = await columnsOf(runner, 'usuario');
      await migration.up(runner);
      return [down, await columnsOf(runner, 'usuario')];
    });

    expect(afterDown).not.toHaveProperty('espacio_usado');
    expect(afterUp).toHaveProperty('espacio_usado');
  });
});
