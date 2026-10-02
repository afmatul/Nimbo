import { ParseUUIDPipe } from '@nestjs/common';
import type { PipeTransform, Type } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import {
  NODE_SORTS as CONTRACT_NODE_SORTS,
  SORT_DIRECTIONS as CONTRACT_SORT_DIRECTIONS,
} from '@nimbo/contracts';

import { describeRoute, listRouteDeclarations } from '../../../../test/support/route-declarations';
import { Role, ZodValidationPipe } from '../../../shared';
import { FileService } from '../application/file.service';
import { SpaceSummaryService } from '../application/space-summary.service';
import { UploadService } from '../application/upload.service';
import { InvalidQueryError } from '../domain/errors';
import { NODE_SORTS, SORT_DIRECTIONS } from '../domain/node-order';

import { FilesController } from './files.controller';
import { FoldersController } from './folders.controller';
import { SpaceController } from './space.controller';
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

  it('CA-17, 006 CA-23: expone exactamente las rutas de cargas y archivos (005 §5 y 006 §4), todas solo para CLIENT', () => {
    const routes = listRouteDeclarations(moduleRef, PREFIX);

    expect(routes.map(describeRoute).sort()).toEqual(
      [
        'POST /api/v1/uploads',
        'POST /api/v1/uploads/:uploadId/resume',
        'POST /api/v1/uploads/:uploadId/complete',
        'DELETE /api/v1/uploads/:uploadId',
        'POST /api/v1/files/:fileId/download-url',
        'PATCH /api/v1/files/:fileId',
        'POST /api/v1/files/:fileId/move',
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

  it.each([[UploadsController, 'init']] as const)(
    'CA-7: %p.%s valida la entrada con `ZodValidationPipe`',
    (controller, method) => {
      expect(pipesOf(controller, method)).toEqual([expect.any(ZodValidationPipe)]);
    },
  );

  it.each([
    [FilesController, 'rename'],
    [FilesController, 'move'],
  ] as const)(
    '006 CA-4, CA-7: %p.%s valida el id como UUID y el cuerpo con `ZodValidationPipe`',
    (controller, method) => {
      expect(pipesOf(controller, method)).toEqual(
        expect.arrayContaining([expect.any(ParseUUIDPipe), expect.any(ZodValidationPipe)]),
      );
      expect(pipesOf(controller, method)).toHaveLength(2);
    },
  );
});

describe('ruta del resumen de espacio (007 plan §4)', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [SpaceController],
      providers: [{ provide: SpaceSummaryService, useValue: {} }],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('007 CA-17: expone solo `GET /storage/summary`, solo para CLIENT', () => {
    const routes = listRouteDeclarations(moduleRef, PREFIX);

    expect(routes.map(describeRoute)).toEqual(['GET /api/v1/storage/summary']);
    expect(routes.every((route) => !route.public)).toBe(true);
    expect(routes.every((route) => route.roles.join() === Role.CLIENT)).toBe(true);
  });
});

describe('consulta de `GET /folders/contents` (007 plan §4)', () => {
  const [pipe] = pipesOf(FoldersController, 'contents') as [ZodValidationPipe<unknown>];
  const METADATA = { type: 'query' } as const;

  function rejectionOf(query: Record<string, unknown>): unknown {
    try {
      pipe.transform(query, METADATA);
    } catch (error) {
      return error;
    }
    throw new Error('la consulta debía rechazarse');
  }

  it('007 CA-10: pasa `sort` y `dir` válidos al controlador', () => {
    expect(pipe.transform({ sort: 'size', dir: 'desc' }, METADATA)).toEqual(
      expect.objectContaining({ sort: 'size', dir: 'desc' }),
    );
  });

  it.each([
    [{ sort: 'peso' }, 'sort', 'INVALID_SORT'],
    [{ dir: 'arriba' }, 'dir', 'INVALID_DIRECTION'],
    [{ cursor: '' }, 'cursor', 'INVALID_CURSOR'],
  ])(
    '007 CA-11: %j responde `400 STORAGE_INVALID_QUERY` con `%s` `%s` en `fields`',
    (query, field, reason) => {
      const error = rejectionOf(query);

      expect(error).toBeInstanceOf(InvalidQueryError);
      expect(error).toMatchObject({
        status: 400,
        code: 'STORAGE_INVALID_QUERY',
        fields: [expect.objectContaining({ field, reason })],
      });
    },
  );
});

describe('orden del dominio y del contrato (007 CA-10)', () => {
  it('`NodeOrder` acepta exactamente los criterios y direcciones de `@nimbo/contracts`', () => {
    expect(NODE_SORTS).toEqual(CONTRACT_NODE_SORTS);
    expect(SORT_DIRECTIONS).toEqual(CONTRACT_SORT_DIRECTIONS);
  });
});
