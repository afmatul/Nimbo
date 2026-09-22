import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Extensión pgvector (plan 000 §4). Reversible mientras ninguna columna use el tipo `vector` (019 lo cuida). */
export class CrearExtensionVector20260915120000 implements MigrationInterface {
  name = 'CrearExtensionVector20260915120000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS vector');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS vector');
  }
}
