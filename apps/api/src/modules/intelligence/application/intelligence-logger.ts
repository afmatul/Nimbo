import type { PinoLogger } from 'nestjs-pino';

/**
 * Bitácora técnica de `intelligence`: solo identificadores, estados y motivos; nunca texto, nombres de archivo,
 * extractos, vectores ni claves (019 CA-21).
 */
export type IntelligenceLogger = Pick<PinoLogger, 'info' | 'warn' | 'error'>;
