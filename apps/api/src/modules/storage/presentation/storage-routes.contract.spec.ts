import { ParseUUIDPipe } from '@nestjs/common';
import type { PipeTransform, Type } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { describeRoute, listRouteDeclarations } from '../../../../test/support/route-declarations';
import { Role, ZodValidationPipe } from '../../../shared';
import { FileService } from '../application/file.service';
import { UploadService } from '../application/upload.service';

import { FilesController } from './files.controller';
import { UploadsController } from './uploads.controller';

const PREFIX = 'api/v1';

/** Los pipes declarados en los parámetros de un manejador (`@Body(pipe)`, `@Param('id', pipe)`, `@Query(pipe)`). */
function pipesOf(controller: Type<unknown>, method: string): unknown[] {
  const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, method) ?? {}) as Record<
    string,
    { pipes?: PipeTransform[] }
  >;
  return Object.values(args).flatMap((arg) => arg.pipes ?? []);
}

describe('rutas de `storage` (CA-17)', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [UploadsController, FilesController],
      providers: [
        { provide: UploadService, useValue: {} },
        { provide: FileService, useValue: {} },
      ],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('CA-17: expone exactamente las seis rutas del plan §5, todas solo para CLIENT', () => {
    const routes = listRouteDeclarations(moduleRef, PREFIX);

    expect(routes.map(describeRoute).sort()).toEqual(
      [
        'POST /api/v1/uploads',
        'POST /api/v1/uploads/:uploadId/resume',
        'POST /api/v1/uploads/:uploadId/complete',
        'DELETE /api/v1/uploads/:uploadId',
        'GET /api/v1/files',
        'POST /api/v1/files/:fileId/download-url',
      ].sort(),
    );
    expect(routes.every((route) => !route.public)).toBe(true);
    expect(routes.every((route) => route.roles.join() === Role.CLIENT)).toBe(true);
  });

  it.each([
    [UploadsController, 'resume'],
    [UploadsController, 'complete'],
    [UploadsController, 'cancel'],
    [FilesController, 'downloadUrl'],
  ] as const)('CA-16: %p.%s valida el id como UUID antes del servicio', (controller, method) => {
    expect(pipesOf(controller, method)).toEqual([expect.any(ParseUUIDPipe)]);
  });

  it.each([
    [UploadsController, 'init'],
    [FilesController, 'list'],
  ] as const)('CA-7: %p.%s valida la entrada con `ZodValidationPipe`', (controller, method) => {
    expect(pipesOf(controller, method)).toEqual([expect.any(ZodValidationPipe)]);
  });
});
