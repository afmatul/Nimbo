import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { listRouteDeclarations } from '../../../../test/support/route-declarations';
import { Role } from '../../../shared';
import { OptimizationService } from '../application/optimization.service';

import { OptimizerController } from './optimizer.controller';

describe('021 T-06 CA-20: declaración de las rutas del optimizador', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [OptimizerController],
      providers: [{ provide: OptimizationService, useValue: {} }],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('expone exactamente estimate, status y run, autenticadas y solo para CLIENT', () => {
    const declarations = listRouteDeclarations(moduleRef, 'api/v1');
    expect(declarations).toHaveLength(3);
    expect(declarations).toEqual(
      expect.arrayContaining([
        {
          method: 'POST',
          path: '/api/v1/files/:fileId/optimization/estimate',
          public: false,
          roles: [Role.CLIENT],
        },
        {
          method: 'GET',
          path: '/api/v1/files/:fileId/optimization',
          public: false,
          roles: [Role.CLIENT],
        },
        {
          method: 'POST',
          path: '/api/v1/files/:fileId/optimization/run',
          public: false,
          roles: [Role.CLIENT],
        },
      ]),
    );
  });
});
