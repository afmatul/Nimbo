'use client';

import type { InternalRoleName } from '@nimbo/contracts';
import { Activity, Lock, ShieldCheck, LifeBuoy } from 'lucide-react';
import type * as React from 'react';

import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { ROLE_LABELS } from '../../access/role-labels';
import type { EnrollField, EnrollForm, FieldErrors } from '../hooks/use-enroll-form';

import { FieldMessage } from './field-message';

/** Id de cada campo; el resumen de errores enlaza a ellos (`#nombre`). */
export const ENROLL_FIELD_IDS: Readonly<Record<EnrollField, string>> = {
  fullName: 'nombre',
  email: 'correo',
  employeeCode: 'codigo',
  role: 'rol',
};

type TextField = Exclude<EnrollField, 'role'>;

interface TextFieldSpec {
  readonly field: TextField;
  readonly label: string;
  readonly help: string;
  readonly input: React.InputHTMLAttributes<HTMLInputElement>;
}

/** Orden de la decisión 2 (los datos de la persona juntos); el ejemplo va en la ayuda, no dentro del campo. */
const TEXT_FIELDS: readonly TextFieldSpec[] = [
  {
    field: 'fullName',
    label: 'Nombre completo',
    help: 'Nombre y apellido de la persona. Los clientes no lo ven: en su auditoría solo aparece el rol.',
    input: { autoComplete: 'off' },
  },
  {
    field: 'email',
    label: 'Correo',
    help: 'Le enviaremos aquí el enlace para fijar su contraseña.',
    input: { type: 'email', autoComplete: 'off', autoCapitalize: 'none', spellCheck: false },
  },
  {
    field: 'employeeCode',
    label: 'Código de empleado',
    help: 'Debe ser único entre las cuentas internas, por ejemplo EMP-0142.',
    input: {
      autoComplete: 'off',
      autoCapitalize: 'characters',
      spellCheck: false,
      className: 'sm:max-w-xs',
    },
  },
];

/** Una línea por rol (decisión 4); Cliente nunca se ofrece (CA-6). */
const ROLE_OPTIONS: readonly {
  readonly role: InternalRoleName;
  readonly icon: typeof ShieldCheck;
  readonly text: string;
}[] = [
  {
    role: 'ADMIN',
    icon: ShieldCheck,
    text: 'Gestiona cuentas, el catálogo de planes y las métricas.',
  },
  {
    role: 'SUPPORT',
    icon: LifeBuoy,
    text: 'Consulta los metadatos de los archivos de los clientes para ayudarles.',
  },
  {
    role: 'OPERATOR',
    icon: Activity,
    text: 'Atiende la infraestructura y la operación del servicio.',
  },
];

export interface EnrollFieldsProps {
  readonly form: EnrollForm['form'];
  readonly errors: FieldErrors;
  /** Enviando: de solo lectura (decisión 10). */
  readonly locked: boolean;
}

const describedBy = (...ids: readonly (string | false)[]): string => ids.filter(Boolean).join(' ');

function TextInput({
  spec,
  props,
}: {
  readonly spec: TextFieldSpec;
  readonly props: EnrollFieldsProps;
}) {
  const id = ENROLL_FIELD_IDS[spec.field];
  const error = props.errors[spec.field];
  return (
    <div>
      <Label htmlFor={id}>{spec.label}</Label>
      <p id={`${id}-ayuda`} className="mt-0.5 text-sm text-secondary-foreground">
        {spec.help}
      </p>
      <Input
        {...spec.input}
        {...props.form.register(spec.field)}
        id={id}
        className={`mt-1.5 ${spec.input.className ?? ''}`}
        readOnly={props.locked}
        error={error !== undefined}
        aria-describedby={describedBy(`${id}-ayuda`, error !== undefined && `${id}-error`)}
      />
      {error === undefined ? null : <FieldMessage id={`${id}-error`} message={error} />}
    </div>
  );
}

type RoleOptionSpec = (typeof ROLE_OPTIONS)[number];

/** Ícono, nombre y la línea que dice qué hace el rol (decisión 4). */
function RoleText({
  option,
  descriptionId,
}: {
  readonly option: RoleOptionSpec;
  readonly descriptionId: string;
}): React.JSX.Element {
  const Icon = option.icon;
  return (
    <span>
      <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
        {ROLE_LABELS[option.role]}
      </span>
      <span id={descriptionId} className="mt-0.5 block text-sm text-secondary-foreground">
        {option.text}
      </span>
    </span>
  );
}

function RoleOption({
  option,
  props,
}: {
  readonly option: RoleOptionSpec;
  readonly props: EnrollFieldsProps;
}): React.JSX.Element {
  const descriptionId = `rol-${option.role.toLowerCase()}-descripcion`;
  return (
    <li>
      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-input bg-card p-3 has-checked:border-primary has-checked:bg-muted has-checked:ring-1 has-checked:ring-primary">
        <input
          type="radio"
          {...props.form.register('role')}
          value={option.role}
          disabled={props.locked}
          aria-invalid={props.errors.role === undefined ? undefined : 'true'}
          aria-describedby={descriptionId}
          className="mt-0.5 h-5 w-5 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <RoleText option={option} descriptionId={descriptionId} />
      </label>
    </li>
  );
}

/** Rol sin preselección (decisión 3): un solo rol y nunca el de Cliente (RN-5). */
function RoleField({ props }: { readonly props: EnrollFieldsProps }): React.JSX.Element {
  const error = props.errors.role;
  return (
    <fieldset
      id="rol"
      tabIndex={-1}
      aria-describedby={describedBy('rol-ayuda', 'rol-nota', error !== undefined && 'rol-error')}
      className="min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <legend className="text-sm font-medium text-foreground">Rol</legend>
      <p id="rol-ayuda" className="mt-0.5 text-sm text-secondary-foreground">
        Define qué puede hacer. Cada persona tiene un solo rol y nunca el de Cliente.
      </p>
      <ul className="mt-2 grid gap-2">
        {ROLE_OPTIONS.map((option) => (
          <RoleOption key={option.role} option={option} props={props} />
        ))}
      </ul>
      {error === undefined ? null : <FieldMessage id="rol-error" message={error} />}
      <p id="rol-nota" className="mt-2 flex items-center gap-1.5 text-sm text-secondary-foreground">
        <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
        Ningún rol ve el contenido de los archivos de los clientes.
      </p>
    </fieldset>
  );
}

/** Los cuatro campos del alta interna (mockup `backoffice/alta-interna`), con su ayuda y su error. */
export function EnrollFields(props: EnrollFieldsProps): React.JSX.Element {
  return (
    <div className="grid gap-5">
      {TEXT_FIELDS.map((spec) => (
        <TextInput key={spec.field} spec={spec} props={props} />
      ))}
      <RoleField props={props} />
    </div>
  );
}
