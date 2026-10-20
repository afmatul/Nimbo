import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aviso del comprobante (spec 009 CA-6, T-08): `invoice-retry` repone también las facturas cuyo aviso no se entregó
 * (`aviso_encolado_en` nulo), no solo las que no tienen PDF. Se redefinen la función de ADR-0021 (misma lista: sin
 * actor, solo ids, tope de 1000, antigüedad mínima de un minuto) y la política de lectura del dueño de la tabla.
 */
export class AvisoDeFactura20261015100000 implements MigrationInterface {
  name = 'AvisoDeFactura20261015100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.define(queryRunner, 'f.clave_objeto IS NULL OR f.aviso_encolado_en IS NULL');
    await queryRunner.query(
      'ALTER POLICY factura_mantenimiento ON factura USING (clave_objeto IS NULL OR aviso_encolado_en IS NULL)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER POLICY factura_mantenimiento ON factura USING (clave_objeto IS NULL)',
    );
    await this.define(queryRunner, 'f.clave_objeto IS NULL');
  }

  /** `CREATE OR REPLACE` conserva el dueño y los permisos (`EXECUTE` solo para `nimbo_app`). */
  private async define(queryRunner: QueryRunner, pending: string): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION facturas_pendientes_de_emitir(p_limite integer)
        RETURNS TABLE (factura_id uuid, usuario_id uuid)
        LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS
        $$
        BEGIN
          IF public.nimbo_actor_id() IS NOT NULL THEN
            RAISE EXCEPTION 'facturas_pendientes_de_emitir solo corre sin actor' USING ERRCODE = 'insufficient_privilege';
          END IF;
          RETURN QUERY
            SELECT f.id, f.usuario_id FROM public.factura f
             WHERE (${pending}) AND f.creado_en <= now() - interval '1 minute'
             ORDER BY f.creado_en LIMIT LEAST(GREATEST(p_limite, 0), 1000);
        END
        $$
    `);
  }
}
