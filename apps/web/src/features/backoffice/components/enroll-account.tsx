'use client';

import { History, KeyRound, UserPlus } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { Button, buttonVariants } from '../../../components/ui/button';
import { ForbiddenState } from '../../access/components/forbidden-state';
import { INTERNAL_PATHS } from '../../access/home-path';
import { useEnrollForm, type EnrollAccountCall, type EnrollForm } from '../hooks/use-enroll-form';
import { useSessionBackofficeApi } from '../hooks/use-session-backoffice-api';

import { BackLink } from './back-link';
import { EnrollFields } from './enroll-fields';
import { EnrollSuccess } from './enroll-success';
import { EnrollSummary } from './enroll-summary';

/** Sin contraseña (P-6) y con el aviso de auditoría, junto al botón de crear (decisiones 5 y 6). */
function EnrollNotes(): React.JSX.Element {
  return (
    <>
      <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted px-3.5 py-3 text-sm text-secondary-foreground">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          <strong className="block font-semibold text-foreground">
            No hay contraseña que definir.
          </strong>
          Le enviaremos un enlace de un solo uso para que la fije. Tú nunca la conoces.
        </p>
      </div>
      <p className="flex items-center gap-1.5 text-sm text-secondary-foreground">
        <History className="h-4 w-4 shrink-0" aria-hidden="true" />
        El alta queda registrada en la auditoría.
      </p>
    </>
  );
}

/** «Crear cuenta», o el botón ocupado sin «Cancelar» mientras se envía (decisión 10: salir no deshace el alta). */
function EnrollActions({
  submitting,
  fullName,
}: {
  readonly submitting: boolean;
  readonly fullName: string;
}) {
  return (
    <div className="flex flex-col gap-2.5 sm:flex-row">
      <Button type="submit" loading={submitting}>
        {submitting ? null : <UserPlus className="h-4 w-4" aria-hidden="true" />}
        {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
      </Button>
      {submitting ? (
        <p role="status" className="sr-only">{`Creando la cuenta de ${fullName}…`}</p>
      ) : (
        <Link
          href={INTERNAL_PATHS.adminAccounts}
          className={buttonVariants({ variant: 'outline' })}
        >
          Cancelar
        </Link>
      )}
    </div>
  );
}

function EnrollFormCard({ enrollment }: { readonly enrollment: EnrollForm }): React.JSX.Element {
  const { phase, errors } = enrollment;
  const submitting = phase.status === 'submitting';
  const problem = phase.status === 'editing' ? phase.problem : null;
  return (
    <form
      noValidate
      aria-labelledby="alta-titulo"
      aria-busy={submitting || undefined}
      onSubmit={(event) => void enrollment.submit(event)}
      className="mt-5 grid gap-5 rounded-lg border border-border bg-card p-5 shadow-card"
    >
      <h2 id="alta-titulo" className="sr-only">
        Datos de la cuenta interna
      </h2>
      <EnrollSummary problem={problem} errors={errors} />
      <p className="text-sm text-secondary-foreground">Todos los campos son obligatorios.</p>
      <EnrollFields form={enrollment.form} errors={errors} locked={submitting} />
      <EnrollNotes />
      <EnrollActions submitting={submitting} fullName={submitting ? phase.fullName : ''} />
    </form>
  );
}

/**
 * Alta de una cuenta interna (011 HU-2, CA-5, CA-6, CA-17; mockup `backoffice/alta-interna`): nombre, correo, código de
 * empleado y rol; la persona recibe un enlace para fijar su contraseña. Ante un error, el formulario conserva lo escrito.
 */
export function EnrollAccount({
  enroll,
}: {
  readonly enroll: EnrollAccountCall;
}): React.JSX.Element {
  const enrollment = useEnrollForm(enroll);
  const { phase } = enrollment;
  if (phase.status === 'forbidden') return <ForbiddenState role="ADMIN" />;
  return (
    <div className="mx-auto w-full max-w-3xl">
      <BackLink href={INTERNAL_PATHS.adminAccounts} label="Volver a cuentas" />
      <h1 className="mt-3 text-2xl font-semibold text-foreground">Nueva cuenta interna</h1>
      <p className="mt-1 text-sm text-secondary-foreground">
        Crea una cuenta para alguien del equipo de Nimbo: Administración, Soporte u Operación.
      </p>
      {phase.status === 'created' ? (
        <EnrollSuccess
          account={phase.account}
          employeeCode={phase.employeeCode}
          onAnother={enrollment.reset}
        />
      ) : (
        <EnrollFormCard enrollment={enrollment} />
      )}
    </div>
  );
}

/** El alta conectada a la API con la sesión en memoria (002). */
export function SessionEnrollAccount({
  apiPublicUrl,
}: {
  readonly apiPublicUrl: string;
}): React.JSX.Element {
  return <EnrollAccount enroll={useSessionBackofficeApi(apiPublicUrl).enrollAccount} />;
}
