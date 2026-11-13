'use client';

import { ChevronDown } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

export interface SelectOption<V extends string = string> {
  readonly value: V;
  readonly label: string;
  readonly disabled?: boolean;
}

type TriggerProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'defaultValue' | 'onChange' | 'children' | 'type'
>;

export interface SelectProps<V extends string = string> extends TriggerProps {
  readonly value: V;
  readonly onValueChange: (value: V) => void;
  readonly options: readonly SelectOption<V>[];
  readonly error?: boolean;
  /** Texto atenuado cuando `value` no coincide con ninguna opción. */
  readonly placeholder?: string;
  readonly ref?: React.Ref<HTMLButtonElement>;
}

const TRIGGER_CLASSES =
  'group inline-flex h-11 min-w-0 cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-card py-2 pl-3 pr-3 text-left text-sm text-foreground shadow-sm transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-45 data-[state=open]:border-ring';

/** El disparador: se ve como `Input`, anuncia un `combobox` que abre un `listbox` y muestra la opción elegida. */
function SelectTrigger({
  selected,
  placeholder,
  props,
}: {
  readonly selected: SelectOption | undefined;
  readonly placeholder: string | undefined;
  readonly props: TriggerProps & {
    readonly error?: boolean;
    readonly ref?: React.Ref<HTMLButtonElement>;
  };
}): React.JSX.Element {
  const { className, error = false, ...rest } = props;
  return (
    <DropdownMenuTrigger
      role="combobox"
      aria-haspopup="listbox"
      aria-invalid={error ? 'true' : undefined}
      className={cn(
        TRIGGER_CLASSES,
        error && 'border-destructive focus-visible:ring-destructive',
        className,
      )}
      {...rest}
    >
      <span className={cn('min-w-0 truncate', selected === undefined && 'text-muted-foreground')}>
        {selected?.label ?? placeholder}
      </span>
      <ChevronDown
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
      />
    </DropdownMenuTrigger>
  );
}

/** La lista abierta: `listbox` con una opción por valor y el check en la elegida (flechas, Inicio/Fin, letras). */
function SelectList<V extends string>({
  value,
  options,
  onValueChange,
}: Pick<SelectProps<V>, 'value' | 'options' | 'onValueChange'>): React.JSX.Element {
  return (
    <DropdownMenuContent
      role="listbox"
      align="start"
      className="max-h-72 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
    >
      <DropdownMenuRadioGroup value={value} onValueChange={(next) => onValueChange(next as V)}>
        {options.map((option) => (
          <DropdownMenuRadioItem
            key={option.value}
            value={option.value}
            disabled={option.disabled ?? false}
            role="option"
            aria-selected={option.value === value}
            className="font-normal data-[state=checked]:text-primary"
          >
            {option.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  );
}

/**
 * Lista desplegable de Cielo Sereno: disparador con la apariencia de `Input` y una lista propia (borde, sombra,
 * `bg-popover`, check en la opción elegida) sobre el menú de Radix, que ya resuelve teclado, foco y cierre con Esc.
 * `className` va al disparador (ancho, alto, márgenes).
 */
export function Select<V extends string = string>({
  value,
  onValueChange,
  options,
  placeholder,
  ...props
}: SelectProps<V>): React.JSX.Element {
  const selected = options.find((option) => option.value === value);
  return (
    <DropdownMenu modal={false}>
      <SelectTrigger selected={selected} placeholder={placeholder} props={props} />
      <SelectList value={value} options={options} onValueChange={onValueChange} />
    </DropdownMenu>
  );
}
