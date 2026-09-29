import { randomUUID } from 'node:crypto';

import { Controller, Get, Injectable, Param, Post } from '@nestjs/common';

import {
  ALL_ROLES,
  CurrentActor,
  CurrentSessionId,
  NotFoundError,
  Public,
  Role,
  Roles,
} from '../../src/shared';
import type { Actor } from '../../src/shared';

const OK = { ok: true } as const;

/** Registro de los manejadores que llegaron a ejecutarse: prueba que un 401/403 no corre el controlador (CA-1). */
@Injectable()
export class ProbeCalls {
  private readonly handled: string[] = [];

  record(handler: string): void {
    this.handled.push(handler);
  }

  count(handler: string): number {
    return this.handled.filter((name) => name === handler).length;
  }

  clear(): void {
    this.handled.length = 0;
  }
}

export interface ProbeResource {
  readonly id: string;
  readonly ownerId: string;
}

/** Recursos de prueba por dueño (CA-11): la búsqueda ya filtra por dueño, nunca se filtra después de encontrar. */
@Injectable()
export class ProbeResources {
  private readonly byOwner = new Map<string, Map<string, ProbeResource>>();

  add(ownerId: string): ProbeResource {
    const resource = Object.freeze({ id: randomUUID(), ownerId });
    const owned = this.byOwner.get(ownerId) ?? new Map<string, ProbeResource>();
    owned.set(resource.id, resource);
    this.byOwner.set(ownerId, owned);
    return resource;
  }

  findOwnedBy(ownerId: string, id: string): ProbeResource | undefined {
    return this.byOwner.get(ownerId)?.get(id);
  }
}

/** Mismo error para un recurso ajeno o inexistente (D-6): la respuesta no revela cuál de los dos fue. */
export class ProbeResourceNotFoundError extends NotFoundError {
  readonly code = 'PROBE_RESOURCE_NOT_FOUND';

  constructor() {
    super('No encontramos el recurso. Revisa el enlace o pide acceso a quien lo compartió.');
  }
}

/** Rutas sonda de 003 (plan §5): una por declaración posible. Solo en `test/support`, nunca en `src/`. */
@Controller('__probe')
export class ProbeController {
  constructor(
    private readonly calls: ProbeCalls,
    private readonly resources: ProbeResources,
  ) {}

  @Public()
  @Get('public')
  public(): typeof OK {
    return this.ok('public');
  }

  @Roles(...ALL_ROLES)
  @Get('actor')
  actor(@CurrentActor() actor: Actor): Actor {
    this.calls.record('actor');
    return actor;
  }

  @Roles(...ALL_ROLES)
  @Get('actor/:id')
  actorById(@CurrentActor() actor: Actor): Actor {
    this.calls.record('actor');
    return actor;
  }

  @Roles(...ALL_ROLES)
  @Post('actor')
  actorFromPost(@CurrentActor() actor: Actor): Actor {
    this.calls.record('actor');
    return actor;
  }

  @Roles(...ALL_ROLES)
  @Get('session')
  session(@CurrentSessionId() sessionId: string): { sessionId: string } {
    this.calls.record('session');
    return { sessionId };
  }

  @Roles(Role.CLIENT)
  @Get('client')
  client(): typeof OK {
    return this.ok('client');
  }

  @Roles(Role.ADMIN)
  @Get('admin')
  admin(): typeof OK {
    return this.ok('admin');
  }

  @Roles(Role.SUPPORT)
  @Get('support')
  support(): typeof OK {
    return this.ok('support');
  }

  @Roles(Role.OPERATOR)
  @Get('operator')
  operator(): typeof OK {
    return this.ok('operator');
  }

  @Roles(Role.ADMIN, Role.SUPPORT)
  @Get('admin-or-support')
  adminOrSupport(): typeof OK {
    return this.ok('admin-or-support');
  }

  @Roles(Role.CLIENT)
  @Get('resources/:id')
  resource(@CurrentActor() actor: Actor, @Param('id') id: string): ProbeResource {
    const resource = this.resources.findOwnedBy(actor.id, id);
    if (resource === undefined) throw new ProbeResourceNotFoundError();
    return resource;
  }

  /** Sin `@Public()` ni `@Roles(...)`: nunca debe responder 200 (CA-1, DT-2). */
  @Get('undeclared')
  undeclared(): typeof OK {
    return this.ok('undeclared');
  }

  private ok(handler: string): typeof OK {
    this.calls.record(handler);
    return OK;
  }
}
