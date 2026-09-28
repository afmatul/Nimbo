import { Controller, Get, Injectable, Post } from '@nestjs/common';

import { ALL_ROLES, CurrentActor, CurrentSessionId, Public, Role, Roles } from '../../src/shared';
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

/**
 * Rutas sonda de 003 (plan §5): una por declaración posible. Solo en `test/support`, nunca en `src/`.
 * `/__probe/resources/:id` llega con T-46.
 */
@Controller('__probe')
export class ProbeController {
  constructor(private readonly calls: ProbeCalls) {}

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
