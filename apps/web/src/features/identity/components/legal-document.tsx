import { LEGAL_DOCUMENTS } from '@nimbo/contracts';
import { useId, type ReactNode } from 'react';

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

/** Fecha de vigencia en español, a partir de `YYYY-MM-DD` de `LEGAL_DOCUMENTS`. */
export function formatLegalDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  const monthName = MONTHS[Number(month) - 1] ?? month;
  return `${String(Number(day))} de ${monthName} de ${year ?? ''}`;
}

export function LegalDocument({
  kind,
  children,
}: {
  readonly kind: 'terms' | 'privacy';
  readonly children: ReactNode;
}): ReactNode {
  const document = kind === 'terms' ? LEGAL_DOCUMENTS.terms : LEGAL_DOCUMENTS.privacy;
  const title = kind === 'terms' ? 'Términos de uso' : 'Política de privacidad';

  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 text-foreground"
    >
      <header className="space-y-2">
        <h1 id={headingId} className="text-2xl font-bold tracking-tight">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">
          Versión {document.version} · vigente desde el {formatLegalDate(document.effectiveDate)}
        </p>
      </header>
      <article className="space-y-4 text-sm leading-6">{children}</article>
    </section>
  );
}
