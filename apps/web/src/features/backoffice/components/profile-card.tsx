import type { JSX, ReactNode } from 'react';

export interface ProfileCardProps {
  /** Id del título: la sección se nombra con él. */
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
}

/** Tarjeta de la ficha de una cuenta (mockup `backoffice/admin`): «Datos de la cuenta» y «Acciones». */
export function ProfileCard({ id, title, subtitle, children }: ProfileCardProps): JSX.Element {
  return (
    <section
      aria-labelledby={id}
      className="rounded-lg border border-border bg-card p-5 shadow-card"
    >
      <h2 id={id} className="text-base font-semibold text-foreground">
        {title}
      </h2>
      {subtitle === undefined ? null : (
        <p className="mt-1 text-sm text-secondary-foreground">{subtitle}</p>
      )}
      {children}
    </section>
  );
}
