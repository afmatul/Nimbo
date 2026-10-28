import { Column, Entity, PrimaryColumn } from 'typeorm';

import { BIGINT_TRANSFORMER } from '../../../../shared';
import type { OptimizationReason, OptimizationState } from '../../domain/optimization-job';

/**
 * Fila de `optimizacion` (migración `CrearOptimizacion…`, plan 021 §3): una por pedido; `motivo` existe si y solo si
 * `estado` es `no_disponible`, `descartada` o `fallida`. Sin nombres, claves de objeto ni rutas temporales.
 */
@Entity('optimizacion')
export class OptimizacionOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'archivo_id' })
  archivoId!: string;

  @Column('uuid', { name: 'version_origen_id' })
  versionOrigenId!: string;

  @Column('uuid', { name: 'version_resultado_id', nullable: true })
  versionResultadoId!: string | null;

  @Column('varchar', { length: 14 })
  estado!: OptimizationState;

  @Column('varchar', { length: 24, nullable: true })
  motivo!: OptimizationReason | null;

  @Column('bigint', { name: 'bytes_origen', transformer: BIGINT_TRANSFORMER })
  bytesOrigen!: bigint;

  @Column('bigint', { name: 'bytes_estimados', nullable: true, transformer: BIGINT_TRANSFORMER })
  bytesEstimados!: bigint | null;

  @Column('bigint', { name: 'bytes_resultado', nullable: true, transformer: BIGINT_TRANSFORMER })
  bytesResultado!: bigint | null;

  @Column('timestamptz', { name: 'creado_en' })
  creadoEn!: Date;

  @Column('timestamptz', { name: 'actualizado_en' })
  actualizadoEn!: Date;
}
