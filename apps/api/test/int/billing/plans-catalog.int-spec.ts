import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';

describe('PlansCatalog (Integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/billing/plans - debe retornar el catálogo de planes público correctamente', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/billing/plans')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);

    // Validar estructura del primer plan
    const plan = response.body[0];
    expect(plan).toHaveProperty('id');
    expect(plan).toHaveProperty('slug');
    expect(plan).toHaveProperty('nombre');
    expect(plan).toHaveProperty('precioCentavos');
    expect(plan).toHaveProperty('cuotaBytes');
  });
});