'use client';

import type * as React from 'react';

import { FieldMessage } from '../../../components/nimbo/field-message';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import type { PlanField, PlanFieldErrors, PlanForm } from '../hooks/use-plan-form';
import { MAX_FILE_UNITS, QUOTA_UNITS } from '../plan-form-values';

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

/** La ayuda de un campo, enlazada con su `aria-describedby`. */
function FieldHelp({
  id,
  text,
}: {
  readonly id: string;
  readonly text: string;
}): React.JSX.Element {
  return (
    <p id={id} className="mt-0.5 text-sm text-secondary-foreground">
      {text}
    </p>
  );
}

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
      <FieldHelp id={`${id}-ayuda`} text={spec.help} />
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
      {error === undefined ? null : (
        <FieldMessage id={`${id}-error`} className="mt-1.5">
          {error}
        </FieldMessage>
      )}
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
      <FieldHelp id={`${id}-ayuda`} text="Una frase sobre para quién es el plan." />
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
      {error === undefined ? null : (
        <FieldMessage id={`${id}-error`} className="mt-1.5">
          {error}
        </FieldMessage>
      )}
    </div>
  );
}

/** El selector de unidad, con su nombre accesible (decisión 9). */
function UnitSelect({
  form,
  unitField,
  units,
  ariaLabel,
  locked,
}: {
  readonly form: PlanForm['form'];
  readonly unitField: 'quotaUnit' | 'maxFileUnit';
  readonly units: readonly string[];
  readonly ariaLabel: string;
  readonly locked: boolean;
}): React.JSX.Element {
  return (
    <select
      {...form.register(unitField)}
      aria-label={ariaLabel}
      disabled={locked}
      className="h-11 rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {units.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

/** El número con su error (decisión 9). */
function NumberInput({
  field,
  id,
  error,
  locked,
  form,
}: {
  readonly field: PlanField;
  readonly id: string;
  readonly error: string | undefined;
  readonly locked: boolean;
  readonly form: PlanForm['form'];
}): React.JSX.Element {
  return (
    <Input
      {...form.register(field)}
      id={id}
      type="number"
      inputMode="numeric"
      min={0}
      autoComplete="off"
      className="max-w-32"
      readOnly={locked}
      error={error !== undefined}
      aria-describedby={describedBy(`${id}-ayuda`, error !== undefined && `${id}-error`)}
    />
  );
}

/** La unidad de un campo: el campo del formulario, sus opciones y el nombre accesible del selector. */
interface PlanUnit {
  readonly field: 'quotaUnit' | 'maxFileUnit';
  readonly units: readonly string[];
  readonly ariaLabel: string;
}

interface NumberWithUnitProps {
  readonly field: PlanField;
  readonly id: string;
  readonly error: string | undefined;
  readonly locked: boolean;
  readonly form: PlanForm['form'];
  readonly unit: PlanUnit;
}

/** El número con su unidad al lado (decisión 9). */
function NumberWithUnit({
  field,
  id,
  error,
  locked,
  form,
  unit,
}: NumberWithUnitProps): React.JSX.Element {
  return (
    <div className="mt-1.5 flex gap-2">
      <NumberInput field={field} id={id} error={error} locked={locked} form={form} />
      <UnitSelect
        form={form}
        unitField={unit.field}
        units={unit.units}
        ariaLabel={unit.ariaLabel}
        locked={locked}
      />
    </div>
  );
}

interface UnitFieldProps {
  readonly field: PlanField;
  readonly label: string;
  readonly help: string;
  readonly unitField: 'quotaUnit' | 'maxFileUnit';
  readonly units: readonly string[];
  readonly props: PlanFormFieldsProps;
}

/** Un campo con su unidad al lado (decisión 9): el selector tiene su nombre accesible. */
function UnitField({
  field,
  label,
  help,
  unitField,
  units,
  props,
}: UnitFieldProps): React.JSX.Element {
  const id = PLAN_FIELD_IDS[field];
  const error = props.errors[field];
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <FieldHelp id={`${id}-ayuda`} text={help} />
      <NumberWithUnit
        field={field}
        id={id}
        error={error}
        locked={props.locked}
        form={props.form}
        unit={{
          field: unitField,
          units,
          ariaLabel: `Unidad de ${label.toLowerCase()}`,
        }}
      />
      {error === undefined ? null : (
        <FieldMessage id={`${id}-error`} className="mt-1.5">
          {error}
        </FieldMessage>
      )}
    </div>
  );
}

/** Los dos campos del plan: su nombre y su descripción. */
function PlanFields({ props }: { readonly props: PlanFormFieldsProps }): React.JSX.Element {
  return (
    <fieldset className="grid gap-4">
      <legend className="text-sm font-semibold text-foreground">Plan</legend>
      <TextField spec={NAME_FIELD} props={props} />
      <DescriptionField props={props} />
    </fieldset>
  );
}

/** El precio del plan, en quetzales. */
function PriceFields({ props }: { readonly props: PlanFormFieldsProps }): React.JSX.Element {
  return (
    <fieldset className="grid gap-4">
      <legend className="text-sm font-semibold text-foreground">Precio</legend>
      <TextField spec={PRICE_FIELD} props={props} />
    </fieldset>
  );
}

/** Los seis límites que recibe cada cuenta con el plan. */
function LimitsFields({ props }: { readonly props: PlanFormFieldsProps }): React.JSX.Element {
  return (
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
        units={QUOTA_UNITS}
        props={props}
      />
      <UnitField
        field="maxFile"
        label="Máximo por archivo"
        help="Hasta 2 GB y nunca más que el almacenamiento."
        unitField="maxFileUnit"
        units={MAX_FILE_UNITS}
        props={props}
      />
      <TextField spec={EDITORS_FIELD} props={props} />
      <TextField spec={QUERIES_FIELD} props={props} />
      <TextField spec={VERSIONS_FIELD} props={props} />
      <TextField spec={TRASH_FIELD} props={props} />
    </fieldset>
  );
}

/** Los campos del plan nuevo (mockup `backoffice/catalogo`, decisiones 9 y 12). */
export function PlanFormFields(props: PlanFormFieldsProps): React.JSX.Element {
  return (
    <div className="grid gap-5">
      <PlanFields props={props} />
      <PriceFields props={props} />
      <LimitsFields props={props} />
    </div>
  );
}
