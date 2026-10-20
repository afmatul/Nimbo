'use client';

import type * as React from 'react';

import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import type { PlanField, PlanFieldErrors, PlanForm } from '../hooks/use-plan-form';

import { FieldMessage } from './field-message';

/** Id de cada campo; el resumen de errores enlaza a ellos (`#nombre`). */
export const PLAN_FIELD_IDS: Readonly<Record<PlanField, string>> = {
  name: 'nombre',
  description: 'descripcion',
  price: 'precio',
  quota: 'espacio',
  maxFile: 'archivo',
  maxEditors: 'editores',
  agentQueries: 'consultas',
  retainedVersions: 'versiones',
  trashRetentionDays: 'papelera',
};

export interface PlanFormFieldsProps {
  readonly form: PlanForm['form'];
  readonly errors: PlanFieldErrors;
  /** Enviando: de solo lectura (decisión 11). */
  readonly locked: boolean;
}

const describedBy = (...ids: readonly (string | false)[]): string => ids.filter(Boolean).join(' ');

interface TextFieldSpec {
  readonly field: PlanField;
  readonly label: string;
  readonly help: string;
  readonly type?: 'text' | 'number';
  readonly inputMode?: 'numeric' | 'decimal';
  readonly placeholder?: string;
}

/** Los campos de texto del formulario (mockup `backoffice/catalogo`, decisiones 9 y 12). */
const NAME_FIELD: TextFieldSpec = {
  field: 'name',
  label: 'Nombre',
  help: 'Lo ven los clientes al elegir plan. Usa uno distinto de los planes activos.',
  placeholder: 'Equipo 2027',
};

const PRICE_FIELD: TextFieldSpec = {
  field: 'price',
  label: 'Precio al mes, en quetzales',
  help: 'Con centavos. Escribe 0.00 si el plan es gratuito.',
  inputMode: 'decimal',
  placeholder: '125.00',
};

const EDITORS_FIELD: TextFieldSpec = {
  field: 'maxEditors',
  label: 'Editores simultáneos',
  help: 'Personas que editan un mismo .docx a la vez.',
  type: 'number',
  inputMode: 'numeric',
};

const QUERIES_FIELD: TextFieldSpec = {
  field: 'agentQueries',
  label: 'Consultas al agente',
  help: 'Preguntas al agente por mes.',
  type: 'number',
  inputMode: 'numeric',
};

const VERSIONS_FIELD: TextFieldSpec = {
  field: 'retainedVersions',
  label: 'Versiones retenidas',
  help: 'Versiones que se guardan de cada archivo.',
  type: 'number',
  inputMode: 'numeric',
};

const TRASH_FIELD: TextFieldSpec = {
  field: 'trashRetentionDays',
  label: 'Días en papelera',
  help: 'Días antes de borrar para siempre lo eliminado.',
  type: 'number',
  inputMode: 'numeric',
};

/** Un campo de texto con su ayuda y su error. */
function TextField({
  spec,
  props,
}: {
  readonly spec: TextFieldSpec;
  readonly props: PlanFormFieldsProps;
}): React.JSX.Element {
  const id = PLAN_FIELD_IDS[spec.field];
  const error = props.errors[spec.field];
  return (
    <div>
      <Label htmlFor={id}>{spec.label}</Label>
      <p id={`${id}-ayuda`} className="mt-0.5 text-sm text-secondary-foreground">
        {spec.help}
      </p>
      <Input
        {...props.form.register(spec.field)}
        id={id}
        type={spec.type ?? 'text'}
        inputMode={spec.inputMode}
        placeholder={spec.placeholder}
        autoComplete="off"
        className="mt-1.5"
        readOnly={props.locked}
        error={error !== undefined}
        aria-describedby={describedBy(`${id}-ayuda`, error !== undefined && `${id}-error`)}
      />
      {error === undefined ? null : <FieldMessage id={`${id}-error`} message={error} />}
    </div>
  );
}

/** La descripción del plan: un párrafo, no una línea (mockup). */
function DescriptionField({ props }: { readonly props: PlanFormFieldsProps }): React.JSX.Element {
  const id = PLAN_FIELD_IDS.description;
  const error = props.errors.description;
  return (
    <div>
      <Label htmlFor={id}>Descripción</Label>
      <p id={`${id}-ayuda`} className="mt-0.5 text-sm text-secondary-foreground">
        Una frase sobre para quién es el plan.
      </p>
      <textarea
        {...props.form.register('description')}
        id={id}
        rows={2}
        maxLength={160}
        readOnly={props.locked}
        aria-invalid={error !== undefined ? 'true' : undefined}
        aria-describedby={describedBy(`${id}-ayuda`, error !== undefined && `${id}-error`)}
        className="mt-1.5 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-45"
      />
      {error === undefined ? null : <FieldMessage id={`${id}-error`} message={error} />}
    </div>
  );
}

/** Un campo con su unidad al lado (decisión 9): el selector tiene su nombre accesible. */
function UnitField({
  field,
  label,
  help,
  unitField,
  units,
  props,
}: {
  readonly field: PlanField;
  readonly label: string;
  readonly help: string;
  /** El campo del formulario que guarda la unidad. */
  readonly unitField: 'quotaUnit' | 'maxFileUnit';
  readonly units: readonly string[];
  readonly props: PlanFormFieldsProps;
}): React.JSX.Element {
  const id = PLAN_FIELD_IDS[field];
  const error = props.errors[field];
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <p id={`${id}-ayuda`} className="mt-0.5 text-sm text-secondary-foreground">
        {help}
      </p>
      <div className="mt-1.5 flex gap-2">
        <Input
          {...props.form.register(field)}
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          autoComplete="off"
          className="max-w-32"
          readOnly={props.locked}
          error={error !== undefined}
          aria-describedby={describedBy(`${id}-ayuda`, error !== undefined && `${id}-error`)}
        />
        <select
          {...props.form.register(unitField)}
          aria-label={`Unidad de ${label.toLowerCase()}`}
          disabled={props.locked}
          className="h-11 rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {units.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      {error === undefined ? null : <FieldMessage id={`${id}-error`} message={error} />}
    </div>
  );
}

/** Los campos del plan nuevo (mockup `backoffice/catalogo`, decisiones 9 y 12). */
export function PlanFormFields(props: PlanFormFieldsProps): React.JSX.Element {
  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-4">
        <legend className="text-sm font-semibold text-foreground">Plan</legend>
        <TextField spec={NAME_FIELD} props={props} />
        <DescriptionField props={props} />
      </fieldset>
      <fieldset className="grid gap-4">
        <legend className="text-sm font-semibold text-foreground">Precio</legend>
        <TextField spec={PRICE_FIELD} props={props} />
      </fieldset>
      <fieldset className="grid gap-4">
        <legend className="text-sm font-semibold text-foreground">Límites</legend>
        <p className="text-sm text-secondary-foreground">
          Cada cuenta con este plan recibe estos límites.
        </p>
        <UnitField
          field="quota"
          label="Almacenamiento"
          help="Espacio total de la cuenta."
          unitField="quotaUnit"
          units={['GB', 'TB']}
          props={props}
        />
        <UnitField
          field="maxFile"
          label="Máximo por archivo"
          help="Hasta 2 GB y nunca más que el almacenamiento."
          unitField="maxFileUnit"
          units={['MB', 'GB']}
          props={props}
        />
        <TextField spec={EDITORS_FIELD} props={props} />
        <TextField spec={QUERIES_FIELD} props={props} />
        <TextField spec={VERSIONS_FIELD} props={props} />
        <TextField spec={TRASH_FIELD} props={props} />
      </fieldset>
    </div>
  );
}
