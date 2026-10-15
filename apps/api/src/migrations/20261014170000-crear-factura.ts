import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Facturas de los pagos aprobados (spec 009 CA-6, plan §3; DF-68). Una por transacción (`UNIQUE`), con el desglose de
 * RN-2 (`ck_factura_total`), el NIT (solo aquí) y el correo del comprobante. `clave_objeto` y `aviso_encolado_en` son
 * nulos hasta que el PDF exista y el aviso se entregue (T-07, T-08). Nunca se borra (RN-7): `RESTRICT` y RLS solo con
 * lectura y alta del dueño.
 *
 * Un `CHECK` no puede mirar otra tabla (revisión I-5): el trigger exige que la transacción sea **aprobada** y del mismo
 * usuario. Corre con los permisos de quien inserta, así que también respeta la RLS de `transaccion`: la de otro
 * cliente no existe para él.
 */
export class CrearFactura20261014170000 implements MigrationInterface {
  name = 'CrearFactura20261014170000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SEQUENCE factura_numero_seq');
    await queryRunner.query(`
      CREATE TABLE factura (
        id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        transaccion_id     uuid         NOT NULL UNIQUE REFERENCES transaccion(id) ON DELETE RESTRICT,
        usuario_id         uuid         NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
        numero             varchar(20)  NOT NULL UNIQUE,
        subtotal_centavos  integer      NOT NULL CHECK (subtotal_centavos >= 0),
        iva_centavos       integer      NOT NULL CHECK (iva_centavos >= 0),
        total_centavos     integer      NOT NULL CHECK (total_centavos > 0),
        nit                varchar(20)  NOT NULL DEFAULT 'CF',
        correo_comprobante varchar(254) NOT NULL,
        clave_objeto       varchar(255),
        aviso_encolado_en  timestamptz,
        creado_en          timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT ck_factura_total CHECK (subtotal_centavos + iva_centavos = total_centavos)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_factura_usuario_creado_en ON factura (usuario_id, creado_en DESC)',
    );
    await queryRunner.query(`
      CREATE FUNCTION factura_de_transaccion_aprobada() RETURNS trigger
        LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM transaccion t
                        WHERE t.id = NEW.transaccion_id AND t.usuario_id = NEW.usuario_id
                          AND t.estado = 'aprobada') THEN
          RAISE EXCEPTION 'La factura debe ser de una transacción aprobada del mismo usuario'
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER tg_factura_usuario_de_transaccion BEFORE INSERT ON factura
        FOR EACH ROW EXECUTE FUNCTION factura_de_transaccion_aprobada()
    `);
    await queryRunner.query('ALTER TABLE factura ENABLE ROW LEVEL SECURITY');
    await queryRunner.query('ALTER TABLE factura FORCE ROW LEVEL SECURITY');
    await queryRunner.query(`
      CREATE POLICY factura_cliente_lectura ON factura FOR SELECT TO nimbo_app
        USING (nimbo_actor_role() = 'CLIENT' AND usuario_id = nimbo_actor_id())
    `);
    await queryRunner.query(`
      CREATE POLICY factura_cliente_alta ON factura FOR INSERT TO nimbo_app
        WITH CHECK (nimbo_actor_role() = 'CLIENT' AND usuario_id = nimbo_actor_id())
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY factura_cliente_alta ON factura');
    await queryRunner.query('DROP POLICY factura_cliente_lectura ON factura');
    await queryRunner.query('DROP TABLE factura');
    await queryRunner.query('DROP FUNCTION factura_de_transaccion_aprobada()');
    await queryRunner.query('DROP SEQUENCE factura_numero_seq');
  }
}
