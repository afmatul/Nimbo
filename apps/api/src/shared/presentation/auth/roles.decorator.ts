import { SetMetadata } from '@nestjs/common';
import type { CustomDecorator } from '@nestjs/common';

import type { Role } from '../../domain/role.enum';

export const ROLES_KEY = 'nimbo:roles';

/**
 * Roles que pueden usar la ruta (003 D-10). En clase o método; el de método manda. Exige al menos un rol: una ruta
 * sin `@Public()` ni `@Roles(...)` responde 403 (DT-2).
 */
export const Roles = (...roles: readonly [Role, ...Role[]]): CustomDecorator =>
  SetMetadata(ROLES_KEY, roles);
