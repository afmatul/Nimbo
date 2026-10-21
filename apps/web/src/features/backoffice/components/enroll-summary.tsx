'use client';

import { AlertCircle } from 'lucide-react';
import * as React from 'react';

import { ServerErrorAlert } from '../../identity/components/server-error-alert';
import { ENROLL_FIELDS, type EnrollProblem, type FieldErrors } from '../hooks/use-enroll-form';

import { ENROLL_FIELD_IDS } from './enroll-fields';

/** Qué datos ya están en uso (CA-6): el correo, el código o ambos. */
function conflictTitle(errors: FieldErrors): string {
  const taken = [
    errors.email === undefined ? null : 'el correo',
    errors.employeeCode === undefined ? null : 'el código de empleado',
  ].filter((part) => part !== null);
  const verb = taken.length > 1 ? 'ya están en uso' : 'ya está en uso';
  return `No creamos la cuenta: ${taken.join(' y ')} ${verb}.`;
}

function fieldsTitle(errors: FieldErrors): string {
  const count = Object.keys(errors).length;
  return `Revisa ${String(count)} ${count === 1 ? 'campo' : 'campos'} para crear la cuenta.`;
}

/** Enlaces a cada campo con error, en el orden del formulario (decisión 8). */
function FieldLinks({ errors }: { readonly errors: FieldErrors }): React.JSX.Element {
  return (
    <ul className="mt-1.5 list-disc pl-5">
      {ENROLL_FIELDS.filter((field) => errors[field] !== undefined).map((field) => (
        <li key={field}>
          <a href={`#${ENROLL_FIELD_IDS[field]}`} className="underline underline-offset-4">
            {errors[field]}
          </a>
        </li>
      ))}
    </ul>
  );
}

type FieldProblem = Extract<EnrollProblem, { kind: 'fields' | 'conflict' }>;

interface SummaryProps {
  readonly problem: EnrollProblem | null;
  readonly errors: FieldErrors;
}

function FieldsSummary({
  problem,
  errors,
  summaryRef,
}: SummaryProps & {
  readonly problem: FieldProblem;
  readonly summaryRef: React.Ref<HTMLDivElement>;
}): React.JSX.Element {
  const conflict = problem.kind === 'conflict';
  return (
    <div
      ref={summaryRef}
      tabIndex={-1}
      role="alert"
      className="flex items-start gap-2.5 rounded-md border border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">{conflict ? conflictTitle(errors) : fieldsTitle(errors)}</p>
        <p>
          {conflict
            ? 'Nada cambió. Corrige los campos marcados y vuelve a intentarlo.'
            : 'Todavía no creamos nada.'}
        </p>
        {conflict ? null : <FieldLinks errors={errors} />}
      </div>
    </div>
  );
}

/**
 * Resumen arriba del formulario (011 CA-6, CA-17; estados `error-campos` y `error-conflicto`) o el error del servidor
 * sin campos. Recibe el foco en cada envío rechazado; lo escrito no se toca.
 */
export function EnrollSummary({ problem, errors }: SummaryProps): React.ReactNode {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (problem !== null) ref.current?.focus();
  }, [problem]);
  if (problem === null) return null;
  if (problem.kind === 'server') {
    return <ServerErrorAlert ref={ref} title="No pudimos crear la cuenta." error={problem.error} />;
  }
  return <FieldsSummary problem={problem} errors={errors} summaryRef={ref} />;
}
