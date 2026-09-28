import { SetMetadata } from '@nestjs/common';
import type { CustomDecorator } from '@nestjs/common';

export const IS_PUBLIC = 'nimbo:isPublic';

/** Ruta sin autenticación (salud, registro, inicio de sesión). En clase o método; lista cerrada en CA-3. */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC, true);
