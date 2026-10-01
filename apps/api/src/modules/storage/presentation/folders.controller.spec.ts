import { ParseUUIDPipe } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { describeRoute, listRouteDeclarations } from '../../../../test/support/route-declarations';
import { Role, ZodValidationPipe } from '../../../shared';
import { FolderService } from '../application/folder.service';

import { FoldersController } from './folders.controller';

const PREFIX = 'api/v1';

/** Los pipes declarados en los parámetros de un manejador, en el orden de los parámetros. */
function pipesOf(method: keyof FoldersController): unknown[] {
  const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, FoldersController, method) ??
    {}) as Record<string, { index: number; pipes?: PipeTransform[] }>;
  return Object.values(args)
    .sort((a, b) => a.index - b.index)
    .flatMap((arg) => arg.pipes ?? []);
}

describe('rutas de carpetas (006 CA-23, plan §4)', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [FoldersController],
      providers: [{ provide: FolderService, useValue: {} }],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('CA-23: expone las cuatro rutas de carpetas del plan, todas solo para CLIENT', () => {
    const routes = listRouteDeclarations(moduleRef, PREFIX);

    expect(routes.map(describeRoute).sort()).toEqual(
      [
        'GET /api/v1/folders/contents',
        'POST /api/v1/folders',
        'PATCH /api/v1/folders/:folderId',
        'POST /api/v1/folders/:folderId/move',
      ].sort(),
    );
    expect(routes.every((route) => !route.public)).toBe(true);
    expect(routes.every((route) => route.roles.join() === Role.CLIENT)).toBe(true);
  });

  it.each([
    ['contents', [ZodValidationPipe]],
    ['create', [ZodValidationPipe]],
    ['rename', [ParseUUIDPipe, ZodValidationPipe]],
    ['move', [ParseUUIDPipe, ZodValidationPipe]],
  ] as const)('CA-2, CA-5: %s valida el id como UUID y la entrada con zod', (method, pipes) => {
    expect(pipesOf(method)).toEqual(pipes.map((pipe) => expect.any(pipe) as unknown));
  });
});
