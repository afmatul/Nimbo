import type { JSX } from 'react';

/** Error bajo un campo; el campo lo enlaza con `aria-describedby={id}`. Sin mensaje no se muestra. */
export function FieldError({
  id,
  message,
}: {
  readonly id: string;
  readonly message: string | undefined;
}): JSX.Element | null {
  if (message === undefined) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}
