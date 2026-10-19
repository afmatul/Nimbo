import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Fila de `participacion` (N:M `participa`, plan 016 §3): conectada mientras `salioEn` es nulo. */
@Entity('participacion')
export class ParticipacionOrmEntity {
  @PrimaryColumn('uuid', { name: 'sesion_edicion_id' })
  sesionEdicionId!: string;

  @PrimaryColumn('uuid', { name: 'usuario_id' })
  usuarioId!: string;

  @Column('timestamptz', { name: 'entro_en' })
  entroEn!: Date;

  @Column('timestamptz', { name: 'salio_en', nullable: true })
  salioEn!: Date | null;
}
