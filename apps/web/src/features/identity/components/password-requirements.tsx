import { evaluatePassword, IDENTITY_FIELD_MESSAGES } from '@nimbo/contracts';
import { Check, X } from 'lucide-react';
import type { JSX } from 'react';

/** Requisitos en vivo: ícono y texto «Cumple» o «Falta», anunciados con `aria-live`. */
export function PasswordRequirements({
  password,
  email,
}: {
  readonly password: string;
  readonly email: string;
}): JSX.Element {
  const results = evaluatePassword(password, email);

  return (
    <ul aria-live="polite" className="space-y-1 text-sm text-foreground">
      {results.map((result) => (
        <li key={result.rule} className="flex min-h-11 items-center gap-2">
          {result.passed ? (
            <Check aria-hidden="true" className="h-4 w-4 text-primary" />
          ) : (
            <X aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          )}
          <span>{IDENTITY_FIELD_MESSAGES[result.reason]}</span>
          <span className="ml-auto text-xs font-medium">{result.passed ? 'Cumple' : 'Falta'}</span>
        </li>
      ))}
    </ul>
  );
}
