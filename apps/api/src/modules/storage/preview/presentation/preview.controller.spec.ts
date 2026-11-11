import { HttpStatus } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { HTTP_CODE_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { previewUrlResponseSchema } from '@nimbo/contracts';

import {
  describeRoute,
  listRouteDeclarations,
} from '../../../../../test/support/route-declarations';
import { createActor, Role, ZodValidationPipe } from '../../../../shared';
import { PreviewService } from '../application/preview.service';

import { PreviewController } from './preview.controller';

const PREFIX = 'api/v1';
const ACTOR = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const FILE_ID = '22222222-2222-4222-8222-222222222222';
const EXPIRES_AT = new Date('2026-10-08T20:05:00.000Z');

const FILE = {
  id: FILE_ID,
  name: 'informe.pdf',
  sizeBytes: 2048,
  kind: 'pdf',
  folderId: null,
  createdAt: '2026-10-08T19:00:00.000Z',
  updatedAt: '2026-10-08T19:00:00.000Z',
};

function pipesOf(method: keyof PreviewController): unknown[] {
  const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, PreviewController, method) ??
    {}) as Record<string, { index: number; pipes?: PipeTransform[] }>;

  return Object.values(args)
    .sort((a, b) => a.index - b.index)
    .flatMap((arg) => arg.pipes ?? []);
}

function setup() {
  const preview = {
    issueUrl: jest.fn().mockResolvedValue({
      file: { ...FILE, objectKey: 'privado', token: 'SECRETO', metadata: { internal: true } },
      url: 'https://s3.test/preview',
      expiresAt: EXPIRES_AT,
      mime: 'application/pdf',
      objectKey: 'privado',
      disposition: 'inline',
      token: 'SECRETO',
    }),
  };

  const controller = new PreviewController(preview as unknown as PreviewService);

  return { preview, controller };
}

describe('PreviewController', () => {
  it('CA-11: responde 200 con el contrato estricto de preview y vencimiento ISO', async () => {
    const { preview, controller } = setup();

    const response = await controller.issueUrl(ACTOR, FILE_ID);

    expect(preview.issueUrl).toHaveBeenCalledWith(ACTOR, FILE_ID);

    expect(response).toEqual({
      file: FILE,
      url: 'https://s3.test/preview',
      expiresAt: '2026-10-08T20:05:00.000Z',
    });

    expect(response).not.toHaveProperty('mime');
    expect(previewUrlResponseSchema.parse(response)).toEqual(response);
    expect(JSON.stringify(response)).not.toContain('SECRETO');

    const handler = Object.getOwnPropertyDescriptor(PreviewController.prototype, 'issueUrl');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler?.value as object)).toBe(HttpStatus.OK);
  });
});

describe('ruta de preview', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [PreviewController],
      providers: [{ provide: PreviewService, useValue: {} }],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('CA-4, CA-11: expone únicamente POST /api/v1/files/:fileId/preview-url para CLIENT', () => {
    const routes = listRouteDeclarations(moduleRef, PREFIX);

    expect(routes.map(describeRoute)).toEqual(['POST /api/v1/files/:fileId/preview-url']);
    expect(routes.every((route) => !route.public)).toBe(true);
    expect(routes.every((route) => route.roles.join() === Role.CLIENT)).toBe(true);
  });

  it('CA-5: valida fileId mediante Zod', () => {
    expect(pipesOf('issueUrl')).toEqual([expect.any(ZodValidationPipe)]);
  });
});
