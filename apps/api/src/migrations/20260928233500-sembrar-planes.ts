import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración de semilla con los cuatro planes oficiales de Nimbo (spec 006a, CA-1, CA-9, RN-1).
 * Utiliza UUIDs estables fijos y define precios en centavos y tamaños en bytes sin conversión intermedia.
 */
export class SembrarPlanes20260928233500 implements MigrationInterface {
  name = 'SembrarPlanes20260928233500';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO plan (
        id,
        nombre,
        slug,
        descripcion,
        precio_centavos,
        cuota_bytes,
        max_archivo_bytes,
        max_editores,
        consultas_agente_mensual,
        versiones_retenidas,
        dias_retencion_papelera
      ) VALUES
      (
        '10000000-0000-4000-8000-000000000001',
        'Personal',
        'personal',
        'Plan gratuito para uso individual con almacenamiento básico',
        0,
        16106127360,
        52428800,
        0,
        20,
        3,
        7
      ),
      (
        '10000000-0000-4000-8000-000000000002',
        'Pro',
        'pro',
        'Plan profesional para usuarios exigentes con edición colaborativa',
        4500,
        107374182400,
        524288000,
        3,
        500,
        30,
        30
      ),
      (
        '10000000-0000-4000-8000-000000000003',
        'Equipo',
        'equipo',
        'Plan para equipos de trabajo con colaboración en tiempo real',
        11000,
        375809638400,
        1073741824,
        5,
        2000,
        60,
        60
      ),
      (
        '10000000-0000-4000-8000-000000000004',
        'Institucional',
        'institucional',
        'Plan de máxima capacidad para organizaciones e instituciones',
        45000,
        2199023255552,
        2147483648,
        5,
        10000,
        100,
        90
      )
      ON CONFLICT (id) DO NOTHING;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM plan
      WHERE id IN (
        '10000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000003',
        '10000000-0000-4000-8000-000000000004'
      );
    `);
  }
}
