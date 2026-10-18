import type { MigrationInterface, QueryRunner } from 'typeorm';

const FUNCTION_SIGNATURE = 'facturas_pendientes_de_emitir(integer)';

/**
 * Emisión del PDF de la factura (spec 009 CA-6, T-07; plan §3; ADR-0021).
 *
 * - `nimbo_app` solo puede actualizar `clave_objeto` y `aviso_encolado_en` (privilegio por columna): el resto de la
 *   factura no cambia nunca (RN-7). La política `factura_cliente_emision` deja hacerlo solo al cliente dueño.
 * - `facturas_pendientes_de_emitir` es el **único** acceso a `factura` sin actor, con la lista de ADR-0021: solo lectura,
 *   `search_path` cerrado, `EXECUTE` solo para `nimbo_app`, devuelve solo ids, tope de 1000 y antigüedad mínima de un
 *   minuto (el cobro emite el PDF justo después del commit; el reintento no compite con él). Falla si hay un actor en
 *   la sesión: la llama solo el `worker`. Como `FORCE` somete también al dueño, `factura_mantenimiento` le deja leer
 *   las facturas sin PDF.
 */
export class EmisionDeFacturas20261015090000 implements MigrationInterface {
  name = 'EmisionDeFacturas20261015090000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('REVOKE UPDATE ON factura FROM nimbo_app');
    await queryRunner.query(
      'GRANT UPDATE (clave_objeto, aviso_encolado_en) ON factura TO nimbo_app',
    );
    await queryRunner.query(`
      CREATE POLICY factura_cliente_emision ON factura FOR UPDATE TO nimbo_app
        USING      (nimbo_actor_role() = 'CLIENT' AND usuario_id = nimbo_actor_id())
        WITH CHECK (nimbo_actor_role() = 'CLIENT' AND usuario_id = nimbo_actor_id())
    `);
    await queryRunner.query(
      'CREATE POLICY factura_mantenimiento ON factura FOR SELECT TO CURRENT_USER USING (clave_objeto IS NULL)',
    );
    await queryRunner.query(`
      CREATE FUNCTION facturas_pendientes_de_emitir(p_limite integer)
        RETURNS TABLE (factura_id uuid, usuario_id uuid)
        LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS
        $$
        BEGIN
          IF public.nimbo_actor_id() IS NOT NULL THEN
            RAISE EXCEPTION 'facturas_pendientes_de_emitir solo corre sin actor' USING ERRCODE = 'insufficient_privilege';
          END IF;
          RETURN QUERY
            SELECT f.id, f.usuario_id FROM public.factura f
             WHERE f.clave_objeto IS NULL AND f.creado_en <= now() - interval '1 minute'
             ORDER BY f.creado_en LIMIT LEAST(GREATEST(p_limite, 0), 1000);
        END
        $$
    `);
    await queryRunner.query(`REVOKE ALL ON FUNCTION ${FUNCTION_SIGNATURE} FROM PUBLIC`);
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION ${FUNCTION_SIGNATURE} TO nimbo_app`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION ${FUNCTION_SIGNATURE}`);
    await queryRunner.query('DROP POLICY factura_mantenimiento ON factura');
    await queryRunner.query('DROP POLICY factura_cliente_emision ON factura');
    await queryRunner.query(
      'REVOKE UPDATE (clave_objeto, aviso_encolado_en) ON factura FROM nimbo_app',
    );
    await queryRunner.query('GRANT UPDATE ON factura TO nimbo_app');
  }
}
