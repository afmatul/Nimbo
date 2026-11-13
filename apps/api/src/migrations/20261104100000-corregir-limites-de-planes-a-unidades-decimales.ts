import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Los cuatro planes de la semilla (006a) guardaban sus límites en base 1024 (100 GiB = 107 374 182 400 bytes), pero
 * toda la UI muestra los tamaños en unidades decimales (`formatBytes`, PD-91), así que el Pro se leía «107,4 GB».
 * Decisión: el catálogo usa unidades decimales, como `product-context.md` §5 (100 GB = 100 000 000 000 bytes). Solo se
 * corrige la fila que conserva el valor original de la semilla: un plan que el administrador ya editó no se toca.
 */
interface PlanLimits {
  readonly id: string;
  readonly binaryQuota: string;
  readonly decimalQuota: string;
  readonly binaryMaxFile: string;
  readonly decimalMaxFile: string;
}

const SEEDED_PLANS: readonly PlanLimits[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    binaryQuota: '16106127360',
    decimalQuota: '15000000000',
    binaryMaxFile: '52428800',
    decimalMaxFile: '50000000',
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    binaryQuota: '107374182400',
    decimalQuota: '100000000000',
    binaryMaxFile: '524288000',
    decimalMaxFile: '500000000',
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    binaryQuota: '375809638400',
    decimalQuota: '350000000000',
    binaryMaxFile: '1073741824',
    decimalMaxFile: '1000000000',
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    binaryQuota: '2199023255552',
    decimalQuota: '2000000000000',
    binaryMaxFile: '2147483648',
    decimalMaxFile: '2000000000',
  },
];

/** Reemplaza un límite de un plan solo si todavía vale `from`. */
async function replaceLimit(
  queryRunner: QueryRunner,
  column: 'cuota_bytes' | 'max_archivo_bytes',
  change: { readonly id: string; readonly from: string; readonly to: string },
): Promise<void> {
  await queryRunner.query(`UPDATE plan SET ${column} = $1 WHERE id = $2 AND ${column} = $3`, [
    change.to,
    change.id,
    change.from,
  ]);
}

export class CorregirLimitesDePlanesAUnidadesDecimales20261104100000 implements MigrationInterface {
  name = 'CorregirLimitesDePlanesAUnidadesDecimales20261104100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const plan of SEEDED_PLANS) {
      await replaceLimit(queryRunner, 'max_archivo_bytes', {
        id: plan.id,
        from: plan.binaryMaxFile,
        to: plan.decimalMaxFile,
      });
      await replaceLimit(queryRunner, 'cuota_bytes', {
        id: plan.id,
        from: plan.binaryQuota,
        to: plan.decimalQuota,
      });
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const plan of SEEDED_PLANS) {
      await replaceLimit(queryRunner, 'cuota_bytes', {
        id: plan.id,
        from: plan.decimalQuota,
        to: plan.binaryQuota,
      });
      await replaceLimit(queryRunner, 'max_archivo_bytes', {
        id: plan.id,
        from: plan.decimalMaxFile,
        to: plan.binaryMaxFile,
      });
    }
  }
}
