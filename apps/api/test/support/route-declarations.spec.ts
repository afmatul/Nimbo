import { Controller, Get, Post } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { Public, Role, Roles } from '../../src/shared';

import { listRouteDeclarations, routeDeclarationProblems } from './route-declarations';

const PREFIX = 'api/v1';

@Public()
@Controller('open')
class OpenController {
  @Get()
  index(): void {}
}

@Roles(Role.CLIENT)
@Controller('items')
class ItemsController {
  @Get(':id')
  show(): void {}

  @Roles(Role.ADMIN, Role.SUPPORT)
  @Post()
  create(): void {}

  @Public()
  @Get('both')
  both(): void {}
}

@Controller('bare')
class BareController {
  @Get('undeclared')
  undeclared(): void {}
}

describe('listRouteDeclarations (CA-7, DT-2)', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [OpenController, ItemsController, BareController],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('CA-7: devuelve `{ method, path, public, roles }` de cada ruta con el prefijo global', () => {
    const routes = listRouteDeclarations(moduleRef, PREFIX);

    expect(routes).toEqual(
      expect.arrayContaining([
        { method: 'GET', path: '/api/v1/open', public: true, roles: [] },
        { method: 'GET', path: '/api/v1/items/:id', public: false, roles: [Role.CLIENT] },
        {
          method: 'POST',
          path: '/api/v1/items',
          public: false,
          roles: [Role.ADMIN, Role.SUPPORT],
        },
        { method: 'GET', path: '/api/v1/items/both', public: true, roles: [Role.CLIENT] },
        { method: 'GET', path: '/api/v1/bare/undeclared', public: false, roles: [] },
      ]),
    );
    expect(routes).toHaveLength(5);
  });

  it('CA-7: nombra por método y ruta la que no declara nada y la que declara las dos cosas', () => {
    const problems = routeDeclarationProblems(listRouteDeclarations(moduleRef, PREFIX));

    expect(problems).toEqual({
      undeclared: ['GET /api/v1/bare/undeclared'],
      declaresBoth: ['GET /api/v1/items/both'],
    });
  });

  it('CA-7: sin prefijo global, las rutas empiezan en la del controlador', () => {
    const routes = listRouteDeclarations(moduleRef, '');

    expect(routes.map((route) => route.path)).toContain('/open');
  });
});
