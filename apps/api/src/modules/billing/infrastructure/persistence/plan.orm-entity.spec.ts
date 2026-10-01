import { PlanOrmEntity } from './plan.orm-entity';

describe('PlanOrmEntity (CA-1, CA-6, RN-2)', () => {
  it('conserva las columnas del catálogo, con bytes en bigint y el precio en centavos', () => {
    const entity = new PlanOrmEntity();
    entity.id = '10000000-0000-4000-8000-000000000001';
    entity.nombre = 'Personal';
    entity.slug = 'personal';
    entity.descripcion = 'Plan gratuito';
    entity.precioCentavos = 0;
    entity.cuotaBytes = 16106127360n;
    entity.maxArchivoBytes = 52428800n;
    entity.maxEditores = 0;
    entity.consultasAgenteMensual = 20;
    entity.versionesRetenidas = 3;
    entity.diasRetencionPapelera = 7;
    entity.creadoEn = new Date();
    entity.actualizadoEn = new Date();

    expect(entity.slug).toBe('personal');
    expect(entity.precioCentavos).toBe(0);
    expect(entity.cuotaBytes).toBe(16106127360n);
    expect(entity.maxArchivoBytes).toBe(52428800n);
    expect(entity.maxEditores).toBe(0);
    expect(entity.consultasAgenteMensual).toBe(20);
    expect(entity.versionesRetenidas).toBe(3);
    expect(entity.diasRetencionPapelera).toBe(7);
  });
});
