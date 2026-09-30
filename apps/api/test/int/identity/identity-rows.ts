import { randomUUID } from 'node:crypto';

import { QueryFailedError } from 'typeorm';
import type { QueryRunner } from 'typeorm';

/** Filas de `identity` para las pruebas de esquema (planes 001 y 002 §4), insertadas con SQL directo. */
export const CREATED_AT = '2026-09-28T10:00:00Z';

export interface UserRow {
  id: string;
  nombre: string;
  correo: string;
  rol: string;
  estado: string;
  version_terminos: string | null;
  version_privacidad: string | null;
  terminos_aceptados_en: string | null;
}

export const aClient = (patch: Partial<UserRow> = {}): UserRow => ({
  id: randomUUID(),
  nombre: 'Ana López',
  correo: `ana-${randomUUID()}@nimbo.me`,
  rol: 'CLIENT',
  estado: 'activa',
  version_terminos: '1.0',
  version_privacidad: '1.0',
  terminos_aceptados_en: CREATED_AT,
  ...patch,
});

export const insertUser = (runner: QueryRunner, row: UserRow): Promise<unknown> =>
  runner.query(
    `INSERT INTO usuario (id, nombre, correo, hash_clave, rol, estado, version_terminos, version_privacidad,
       terminos_aceptados_en)
     VALUES ($1, $2, $3, '$argon2id$prueba', $4, $5, $6, $7, $8)`,
    [
      row.id,
      row.nombre,
      row.correo,
      row.rol,
      row.estado,
      row.version_terminos,
      row.version_privacidad,
      row.terminos_aceptados_en,
    ],
  );

/** Nombre de la restricción que violó `work`, o `undefined` si la sentencia pasó. */
export const violatedConstraint = async (work: Promise<unknown>): Promise<string | undefined> => {
  try {
    await work;
  } catch (error) {
    if (error instanceof QueryFailedError) {
      return (error.driverError as { constraint?: string }).constraint;
    }
    throw error;
  }
  return undefined;
};
