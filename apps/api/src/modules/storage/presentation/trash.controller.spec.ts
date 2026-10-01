import { HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { HTTP_CODE_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { describeRoute, listRouteDeclarations } from '../../../../test/support/route-declarations';
import { createActor, Role, ZodValidationPipe } from '../../../shared';
import { TrashService } from '../application/trash.service';

import { TrashController } from './trash.controller';

const PREFIX = 'api/v1';

/** Los pipes declarados en los parámetros de un manejador, en el orden de los parámetros. */
function pipesOf(method: keyof TrashController): unknown[] {
  const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, TrashController, method) ?? {}) as Record<
    string,
    { index: number; pipes?: PipeTransform[] }
  >;
  return Object.values(args)
    .sort((a, b) => a.index - b.index)
    .flatMap((arg) => arg.pipes ?? []);
}

describe('rutas de la papelera (006 CA-23, plan §4)', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [TrashController],
      providers: [{ provide: TrashService, useValue: {} }],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('CA-23: expone eliminar, listar, resumir, restaurar, purgar y vaciar, todas solo para CLIENT', () => {
    const routes = listRouteDeclarations(moduleRef, PREFIX);

    expect(routes.map(describeRoute).sort()).toEqual(
      [
        'DELETE /api/v1/files/:fileId',
        'DELETE /api/v1/folders/:folderId',
        'DELETE /api/v1/trash',
        'DELETE /api/v1/trash/files/:fileId',
        'DELETE /api/v1/trash/folders/:folderId',
        'GET /api/v1/trash',
        'GET /api/v1/trash/summary',
        'POST /api/v1/trash/files/:fileId/restore',
        'POST /api/v1/trash/folders/:folderId/restore',
      ].sort(),
    );
    expect(routes.every((route) => !route.public)).toBe(true);
    expect(routes.every((route) => route.roles.join() === Role.CLIENT)).toBe(true);
  });

  it.each([
    ['trashFile', [ParseUUIDPipe]],
    ['trashFolder', [ParseUUIDPipe]],
    ['restoreFile', [ParseUUIDPipe]],
    ['restoreFolder', [ParseUUIDPipe]],
    ['purgeFile', [ParseUUIDPipe]],
    ['purgeFolder', [ParseUUIDPipe]],
    ['list', [ZodValidationPipe]],
  ] as const)('CA-16: %s valida el id como UUID o la consulta con zod', (method, pipes) => {
    expect(pipesOf(method)).toEqual(pipes.map((pipe) => expect.any(pipe) as unknown));
  });
});

describe('TrashController: purgar y vaciar (006 CA-16, CA-18)', () => {
  const purge = jest.fn();
  const empty = jest.fn();
  const controller = new TrashController({ purge, empty } as unknown as TrashService);
  const actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
  const id = '33333333-3333-4333-8333-333333333333';

  it('CA-18: eliminar definitivamente delega por tipo y responde los bytes liberados como número', async () => {
    purge.mockResolvedValue(42n);

    await expect(controller.purgeFile(actor, id)).resolves.toEqual({ freedBytes: 42 });
    await expect(controller.purgeFolder(actor, id)).resolves.toEqual({ freedBytes: 42 });
    expect(purge.mock.calls).toEqual([
      [actor, { type: 'file', id }],
      [actor, { type: 'folder', id }],
    ]);
  });

  it('CA-18: vaciar responde 202 con lo programado', async () => {
    empty.mockResolvedValue({ itemCount: 3, totalBytes: 1000n });

    await expect(controller.empty(actor)).resolves.toEqual({
      scheduledItems: 3,
      pendingBytes: 1000,
    });
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, TrashController.prototype.empty)).toBe(
      HttpStatus.ACCEPTED,
    );
  });
});
