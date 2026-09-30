import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

import { BIGINT_TRANSFORMER } from '../../../../shared';

/**
 * Fila de `plan` (spec 006a, RN-2). Propiedades en inglés; columnas en español.
 * Los bytes usan el transformador compartido: `pg` entrega `bigint` como texto.
 */
@Entity('plan')
export class PlanOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('varchar', { length: 100 })
  nombre!: string;

  @Column('varchar', { length: 50, unique: true })
  slug!: string;

  @Column('text', { nullable: true })
  descripcion!: string | null;

  @Column('integer', { name: 'precio_centavos' })
  precioCentavos!: number;

  @Column('bigint', { name: 'cuota_bytes', transformer: BIGINT_TRANSFORMER })
  cuotaBytes!: bigint;

  @Column('bigint', { name: 'max_archivo_bytes', transformer: BIGINT_TRANSFORMER })
  maxArchivoBytes!: bigint;

  @Column('integer', { name: 'max_editores' })
  maxEditores!: number;

  @Column('integer', { name: 'consultas_agente_mensual' })
  consultasAgenteMensual!: number;

  @Column('integer', { name: 'versiones_retenidas' })
  versionesRetenidas!: number;

  @Column('integer', { name: 'dias_retencion_papelera' })
  diasRetencionPapelera!: number;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
