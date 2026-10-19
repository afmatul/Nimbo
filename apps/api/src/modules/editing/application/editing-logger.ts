import type { PinoLogger } from 'nestjs-pino';

/** Bitácora técnica de `editing`: solo identificadores, nunca nombres de archivo, tokens ni URLs (RNF-17). */
export type EditingLogger = Pick<PinoLogger, 'info' | 'warn' | 'error'>;
