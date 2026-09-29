import {
  evaluatePassword,
  IDENTITY_FIELD_MESSAGES,
  type FieldIssueReason,
  type PasswordRuleResult,
} from '@nimbo/contracts';
import { Check, X } from 'lucide-react';
import type { JSX } from 'react';

import { cn } from '../../../lib/utils';

/**
 * Rótulos de la UI para las reglas que en `contracts` se redactan como error. Solo se usan cuando la regla
 * se cumple: un «Cumple» junto a «Esta contraseña es muy común…» se leería al revés.
 */
const PASSED_LABELS: Partial<Record<FieldIssueReason, string>> = {
  PASSWORD_COMMON: 'No es una contraseña común',
  PASSWORD_EQUALS_EMAIL: 'Es distinta de tu correo',
};

function labelOf(result: PasswordRuleResult): string {
  const passedLabel = result.passed ? PASSED_LABELS[result.reason] : undefined;
  return passedLabel ?? IDENTITY_FIELD_MESSAGES[result.reason];
}

/**
 * Requisitos en vivo: ícono, color y texto «Cumple» o «Falta», anunciados con `aria-live`. Sin contraseña
 * escrita, «Falta» va en gris: todavía no es un error.
 */
export function PasswordRequirements({
  password,
  email,
}: {
  readonly password: string;
  readonly email: string;
}): JSX.Element {
  const results = evaluatePassword(password, email);
  const missingTone = password === '' ? 'text-muted-foreground' : 'text-destructive';

  return (
    <ul aria-live="polite" className="space-y-1 text-sm text-foreground">
      {results.map((result) => {
        const tone = result.passed ? 'text-success-foreground' : missingTone;
        const Icon = result.passed ? Check : X;
        return (
          <li key={result.rule} className="flex min-h-11 items-center gap-2">
            <Icon aria-hidden="true" className={cn('h-4 w-4 shrink-0', tone)} />
            <span>{labelOf(result)}</span>
            <span className={cn('ml-auto text-xs font-medium', tone)}>
              {result.passed ? 'Cumple' : 'Falta'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
