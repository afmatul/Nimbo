import { Column, Entity, PrimaryColumn } from 'typeorm';

import type { EditSessionFailure, EditSessionState } from '../../domain/edit-session';

/**
 * Fila de `sesion_edicion` (migración `CrearSesionEdicionYParticipacion…`, plan 016 §3). `archivoId` y
 * `versionBaseId` no son FK (DF-70); `motivoFallo` existe si y solo si `estado = 'fallida'`.
 */
@Entity('sesion_edicion')
export class SesionEdicionOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'archivo_id' })
  archivoId!: string;

  @Column('uuid', { name: 'propietario_id' })
  propietarioId!: string;

  @Column('uuid', { name: 'abierta_por' })
  abiertaPor!: string;

  @Column('uuid', { name: 'version_base_id' })
  versionBaseId!: string;

  @Column('varchar', { length: 12 })
  estado!: EditSessionState;

  @Column('varchar', { name: 'motivo_fallo', length: 30, nullable: true })
  motivoFallo!: EditSessionFailure | null;

  @Column('timestamptz', { name: 'iniciada_en' })
  iniciadaEn!: Date;

  @Column('timestamptz', { name: 'finalizada_en', nullable: true })
  finalizadaEn!: Date | null;
}
