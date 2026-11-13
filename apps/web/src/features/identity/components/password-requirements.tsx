import {
  evaluatePassword,
  IDENTITY_FIELD_MESSAGES,
  type PasswordRule,
  type PasswordRuleResult,
} from '@nimbo/contracts';
import { CircleAlert, CircleCheck, CircleDashed, CircleX } from 'lucide-react';
import type { JSX } from 'react';

import { cn } from '../../../lib/utils';

/**
 * Lo que se lista como requisito: solo la composición. El tope técnico de longitud, «no es común» y «no es tu correo»
 * se validan igual (aquí y en el servidor), pero no se listan: si fallan, se explica el motivo debajo de la lista.
 */
const CHECKLIST_RULES: ReadonlySet<PasswordRule> = new Set([
  'minLength',
  'uppercase',
  'number',
  'symbol',
]);

type Strength = 'empty' | 'weak' | 'fair' | 'strong';

const STRENGTH_LABELS: Readonly<Record<Strength, string>> = {
  empty: 'Escribe una contraseña',
  weak: 'Débil',
  fair: 'Media',
  strong: 'Fuerte',
};

/** Texto (AA sobre `card`) y relleno de los segmentos del medidor, solo con tokens. */
const STRENGTH_TONES: Readonly<Record<Strength, { text: string; fill: string }>> = {
  empty: { text: 'text-muted-foreground', fill: 'bg-muted' },
  weak: { text: 'text-destructive', fill: 'bg-destructive' },
  fair: { text: 'text-warning-foreground', fill: 'bg-warning' },
  strong: { text: 'text-success-foreground', fill: 'bg-success' },
};

/** Fortaleza según los requisitos cumplidos: todos son «Fuerte»; la mitad o más, «Media». */
export function strengthOf(password: string, checklist: readonly PasswordRuleResult[]): Strength {
  if (password === '') return 'empty';
  const passed = checklist.filter((result) => result.passed).length;
  if (passed === checklist.length) return 'strong';
  return passed * 2 >= checklist.length ? 'fair' : 'weak';
}

function StrengthMeter({
  strength,
  passed,
  total,
}: {
  readonly strength: Strength;
  readonly passed: number;
  readonly total: number;
}): JSX.Element {
  const tone = STRENGTH_TONES[strength];
  return (
    <div className="space-y-1.5">
      <div aria-hidden="true" className="grid grid-cols-4 gap-1">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={cn('h-1.5 rounded-full', index < passed ? tone.fill : 'bg-muted')}
          />
        ))}
      </div>
      <p aria-live="polite" className="flex items-center justify-between text-xs">
        <span className={cn('font-medium', tone.text)}>Seguridad: {STRENGTH_LABELS[strength]}</span>
        <span className="tabular-nums text-muted-foreground">
          {passed} de {total} requisitos
        </span>
      </p>
    </div>
  );
}

function RequirementItem({
  result,
  typed,
}: {
  readonly result: PasswordRuleResult;
  readonly typed: boolean;
}): JSX.Element {
  const Icon = result.passed ? CircleCheck : typed ? CircleX : CircleDashed;
  const tone = result.passed
    ? 'text-success-foreground'
    : typed
      ? 'text-destructive'
      : 'text-muted-foreground';
  return (
    <li className="flex min-h-8 items-center gap-2">
      <Icon aria-hidden="true" className={cn('h-4 w-4 shrink-0', tone)} />
      <span className={result.passed ? 'text-foreground' : 'text-muted-foreground'}>
        {IDENTITY_FIELD_MESSAGES[result.reason]}
      </span>
      <span className="sr-only">{result.passed ? ': cumple' : ': falta'}</span>
    </li>
  );
}

/** Motivo de la primera regla oculta que falla (común, igual al correo o tope técnico), solo con algo escrito. */
function HiddenRuleError({
  hidden,
  typed,
}: {
  readonly hidden: readonly PasswordRuleResult[];
  readonly typed: boolean;
}): JSX.Element | null {
  const failed = typed ? hidden.find((result) => !result.passed) : undefined;
  if (failed === undefined) return null;
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
      <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{IDENTITY_FIELD_MESSAGES[failed.reason]}</span>
    </p>
  );
}

/**
 * Requisitos en vivo (001 CA-22): medidor de seguridad, lista de composición con ícono y texto para lectores, y el
 * motivo de las reglas que se validan sin listarse. `email` vacío no evalúa «igual al correo» (no se conoce aquí).
 */
export function PasswordRequirements({
  password,
  email,
}: {
  readonly password: string;
  readonly email: string;
}): JSX.Element {
  const results = evaluatePassword(password, email);
  const checklist = results.filter((result) => CHECKLIST_RULES.has(result.rule));
  const hidden = results.filter((result) => !CHECKLIST_RULES.has(result.rule));
  const typed = password !== '';
  const passed = checklist.filter((result) => result.passed).length;
  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-3">
      <StrengthMeter
        strength={strengthOf(password, checklist)}
        passed={passed}
        total={checklist.length}
      />
      <ul aria-label="Requisitos de la contraseña" className="grid gap-x-4 text-sm sm:grid-cols-2">
        {checklist.map((result) => (
          <RequirementItem key={result.rule} result={result} typed={typed} />
        ))}
      </ul>
      <HiddenRuleError hidden={hidden} typed={typed} />
    </div>
  );
}
