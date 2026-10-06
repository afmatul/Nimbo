import type { PipeTransform } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AUDIT_ERROR_CODES } from '@nimbo/contracts';

import { describeRoute, listRouteDeclarations } from '../../../../test/support/route-declarations';
import { ALL_ROLES, ZodValidationPipe } from '../../../shared';
import { AuditService } from '../application/audit.service';
import { InvalidAuditQueryError } from '../domain/audit-query';

import { AuditController } from './audit.controller';

const PREFIX = 'api/v1';
const METADATA = { type: 'query' } as const;

/** Los pipes declarados en los parámetros de `myEvents` (`@Query(pipe)`). */
const pipesOfMyEvents = (): unknown[] => {
  const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, AuditController, 'myEvents') ??
    {}) as Record<string, { pipes?: PipeTransform[] }>;
  return Object.values(args).flatMap((arg) => arg.pipes ?? []);
};

function rejectionOf(query: Record<string, unknown>): unknown {
  const [pipe] = pipesOfMyEvents() as [ZodValidationPipe<unknown>];
  try {
    pipe.transform(query, METADATA);
  } catch (error) {
    return error;
  }
  throw new Error('la consulta debía rechazarse');
}

describe('rutas de `audit` (plan 004 §4)', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: AuditService, useValue: {} }],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('CA-6, CA-8, CA-12: expone solo `GET /audit/my-events`, no pública, para los cuatro roles', () => {
    const routes = listRouteDeclarations(moduleRef, PREFIX);

    expect(routes.map(describeRoute)).toEqual(['GET /api/v1/audit/my-events']);
    expect(routes.every((route) => !route.public)).toBe(true);
    expect(routes.map((route) => [...route.roles].sort())).toEqual([[...ALL_ROLES].sort()]);
  });

  it('CA-10: valida la consulta con `ZodValidationPipe`', () => {
    expect(pipesOfMyEvents()).toEqual([expect.any(ZodValidationPipe)]);
  });

  it.each([
    [{ from: 'ayer' }, 'from', 'INVALID_DATE'],
    [{ from: '2026-10-02T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' }, 'to', 'INVALID_RANGE'],
    [{ origin: 'admin' }, 'origin', 'INVALID_ORIGIN'],
    [{ cursor: '' }, 'cursor', 'INVALID_CURSOR'],
  ])('CA-10: %j es `400 AUDIT_INVALID_QUERY` con `%s` `%s`', (query, field, reason) => {
    const error = rejectionOf(query);

    expect(error).toBeInstanceOf(InvalidAuditQueryError);
    expect(error).toMatchObject({
      status: 400,
      code: AUDIT_ERROR_CODES.AUDIT_INVALID_QUERY,
      fields: [expect.objectContaining({ field, reason })],
    });
  });
});
