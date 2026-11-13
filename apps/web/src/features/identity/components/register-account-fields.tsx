'use client';

import type { RegisterRequest } from '@nimbo/contracts';
import type { JSX } from 'react';
import { useWatch, type UseFormReturn } from 'react-hook-form';

import { TextLink } from '../../../components/nimbo/text-link';
import { Checkbox } from '../../../components/ui/checkbox';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';

import { PasswordRequirements } from './password-requirements';

function FieldMessage({ message }: { readonly message: string | undefined }): JSX.Element | null {
  return message === undefined ? null : <p className="text-xs text-destructive">{message}</p>;
}

/** Paso «Cuenta» del registro: nombre, correo, contraseña con sus requisitos y la aceptación de los términos. */
export function RegisterAccountFields({
  form,
}: {
  readonly form: UseFormReturn<RegisterRequest>;
}): JSX.Element {
  const { register, control, formState } = form;
  const { errors } = formState;
  const password = useWatch({ control, name: 'password' }) ?? '';
  const email = useWatch({ control, name: 'email' }) ?? '';
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="fullName">Nombre completo</Label>
        <Input
          id="fullName"
          autoComplete="name"
          error={errors.fullName !== undefined}
          {...register('fullName')}
        />
        <FieldMessage message={errors.fullName?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Correo</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          error={errors.email !== undefined}
          {...register('email')}
        />
        <FieldMessage message={errors.email?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          error={errors.password !== undefined}
          {...register('password')}
        />
        <PasswordRequirements password={password} email={email} />
      </div>
      <Checkbox
        label={
          <>
            Acepto los <TextLink href="/terminos">Términos</TextLink> y la{' '}
            <TextLink href="/privacidad">Política de privacidad</TextLink>.
          </>
        }
        error={errors.acceptTerms !== undefined}
        errorMessage={errors.acceptTerms?.message}
        {...register('acceptTerms')}
      />
    </>
  );
}
