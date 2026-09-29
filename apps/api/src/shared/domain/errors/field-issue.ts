/**
 * Un campo de entrada inválido y la regla que incumple (001 plan §6.7). Se declara aquí porque el dominio no
 * importa `@nimbo/contracts` (ADR-0008); es estructuralmente igual al elemento de `ErrorResponse.fields`.
 */
export interface FieldIssue {
  readonly field: string;
  /** Código estable `SCREAMING_SNAKE` de la regla incumplida. */
  readonly reason: string;
  /** Mensaje en español con la acción correctiva. */
  readonly message: string;
}
