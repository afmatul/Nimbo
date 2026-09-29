import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import { toFieldIssues } from '@nimbo/contracts';
import type { ZodType, ZodTypeDef } from 'zod';

import type { DomainError, FieldIssue } from '../domain/errors';

/** Cada módulo construye su propio error de entrada, así el `code` lleva el prefijo del módulo (ADR-0020). */
export type InvalidInputFactory = (issues: readonly FieldIssue[]) => DomainError;

/**
 * Valida el cuerpo con un esquema de `@nimbo/contracts` (ADR-0020). Si falla, convierte los *issues* con la
 * `toFieldIssues` genérica y lanza el error que devuelve la fábrica del módulo; `DomainExceptionFilter` lo
 * traduce. Un cuerpo ausente (p. ej. `text/plain`, que el analizador JSON no lee) se valida como `{}`, así la
 * respuesta nombra cada campo `REQUIRED`. `shared` no conoce los esquemas de ningún módulo.
 */
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(
    private readonly schema: ZodType<TOutput, ZodTypeDef, unknown>,
    private readonly toError: InvalidInputFactory,
  ) {}

  transform(value: unknown, _metadata: ArgumentMetadata): TOutput {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw this.toError(toFieldIssues(result.error));
    }
    return result.data;
  }
}
