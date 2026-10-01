import { ParseUUIDPipe } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { describeRoute, listRouteDeclarations } from '../../../../test/support/route-declarations';
import { Role, ZodValidationPipe } from '../../../shared';
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

  it('CA-23: expone eliminar, listar, resumir y restaurar, todas solo para CLIENT', () => {
    const routes = listRouteDeclarations(moduleRef, PREFIX);

    expect(routes.map(describeRoute).sort()).toEqual(
      [
        'DELETE /api/v1/files/:fileId',
        'DELETE /api/v1/folders/:folderId',
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
    ['list', [ZodValidationPipe]],
  ] as const)('CA-16: %s valida el id como UUID o la consulta con zod', (method, pipes) => {
    expect(pipesOf(method)).toEqual(pipes.map((pipe) => expect.any(pipe) as unknown));
  });
});
