import { HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { HTTP_CODE_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { describeRoute, listRouteDeclarations } from '../../../../test/support/route-declarations';
import { createActor, Role } from '../../../shared';
import { QuickAccessService } from '../application/quick-access.service';

import { QuickAccessController } from './quick-access.controller';
import { NodeTypePipe } from './storage-validation';

const PREFIX = 'api/v1';
const ACTOR = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const NODE_ID = '44444444-4444-4444-8444-444444444444';
const ITEM = { type: 'folder' as const, id: NODE_ID, name: 'Informes' };

type Handler = 'list' | 'pin' | 'unpin' | 'recordOpen';

function httpCodeOf(method: Handler): unknown {
  const handler = Object.getOwnPropertyDescriptor(QuickAccessController.prototype, method);
  return Reflect.getMetadata(HTTP_CODE_METADATA, handler?.value as object);
}

function pipesOf(method: Handler): unknown[] {
  const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, QuickAccessController, method) ??
    {}) as Record<string, { index: number; pipes?: PipeTransform[] }>;
  return Object.values(args)
    .sort((a, b) => a.index - b.index)
    .flatMap((arg) => arg.pipes ?? []);
}

function setup() {
  const service = {
    list: jest.fn().mockResolvedValue({ pinned: [ITEM], recent: [], hasMoreRecent: false }),
    pin: jest.fn().mockResolvedValue(ITEM),
    unpin: jest.fn().mockResolvedValue(undefined),
    recordOpen: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new QuickAccessController(service as unknown as QuickAccessService);
  return { service, controller };
}

describe('rutas de accesos rápidos (006 CA-27, CA-28, plan §9.2)', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [QuickAccessController],
      providers: [{ provide: QuickAccessService, useValue: {} }],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('CA-28: expone las cuatro rutas del plan, todas solo para CLIENT', () => {
    const routes = listRouteDeclarations(moduleRef, PREFIX);

    expect(routes.map(describeRoute).sort()).toEqual(
      [
        'GET /api/v1/quick-access',
        'PUT /api/v1/quick-access/pins/:nodeType/:nodeId',
        'DELETE /api/v1/quick-access/pins/:nodeType/:nodeId',
        'POST /api/v1/quick-access/recents/:nodeType/:nodeId',
      ].sort(),
    );
    expect(routes.every((route) => !route.public)).toBe(true);
    expect(routes.every((route) => route.roles.join() === Role.CLIENT)).toBe(true);
  });

  it.each(['pin', 'unpin', 'recordOpen'] as const)(
    'CA-22: %s valida `:nodeType` y `:nodeId` antes del servicio',
    (method) => {
      expect(pipesOf(method)).toEqual([expect.any(NodeTypePipe), expect.any(ParseUUIDPipe)]);
    },
  );

  it('CA-27: `GET` delega con el actor y responde 200 con el listado', async () => {
    const { service, controller } = setup();

    await expect(controller.list(ACTOR)).resolves.toEqual({
      pinned: [ITEM],
      recent: [],
      hasMoreRecent: false,
    });
    expect(service.list).toHaveBeenCalledWith(ACTOR);
  });

  it('CA-28: `PUT` fija y responde 200 con el elemento', async () => {
    const { service, controller } = setup();

    await expect(controller.pin(ACTOR, 'folder', NODE_ID)).resolves.toEqual(ITEM);
    expect(service.pin).toHaveBeenCalledWith(ACTOR, { type: 'folder', id: NODE_ID });
    expect(httpCodeOf('pin')).toBe(HttpStatus.OK);
  });

  it('CA-28, CA-27: `DELETE` del fijado y `POST` de reciente responden 204 sin cuerpo', async () => {
    const { service, controller } = setup();

    await expect(controller.unpin(ACTOR, 'file', NODE_ID)).resolves.toBeUndefined();
    await expect(controller.recordOpen(ACTOR, 'file', NODE_ID)).resolves.toBeUndefined();

    expect(service.unpin).toHaveBeenCalledWith(ACTOR, { type: 'file', id: NODE_ID });
    expect(service.recordOpen).toHaveBeenCalledWith(ACTOR, { type: 'file', id: NODE_ID });
    expect(httpCodeOf('unpin')).toBe(HttpStatus.NO_CONTENT);
    expect(httpCodeOf('recordOpen')).toBe(HttpStatus.NO_CONTENT);
  });
});
