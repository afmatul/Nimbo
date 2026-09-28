import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

/**
 * Guards globales de `api` (003 §6.2): primero `JwtAuthGuard` y luego `RolesGuard`. Estático y sin dependencias de
 * otros módulos: la estrategia `ACCESS_TOKEN_STRATEGY` la registra quien componga la app (`IdentityModule` desde 002,
 * o el módulo de sonda en pruebas); sin ella, toda ruta no pública responde 401. El `worker` no lo importa.
 */
@Module({
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthGuardsModule {}
