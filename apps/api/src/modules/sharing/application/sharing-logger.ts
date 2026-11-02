import type { PinoLogger } from 'nestjs-pino';

/**
 * Bitácora técnica de `sharing` (plan 012 §5): solo identificadores y el nivel; nunca correos, nombres de archivo ni
 * el cuerpo de la petición (CA-19, RNF-17).
 */
export type SharingLogger = Pick<PinoLogger, 'info' | 'warn'>;
