/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';

import { RadioGroup } from './radio-group';

const OPTIONS = [
  { value: 'personal', label: 'Personal' },
  { value: 'equipo', label: 'Equipo' },
] as const;

const radio = (label: string): HTMLInputElement => screen.getByLabelText(label);

describe('RadioGroup en el navegador', () => {
  it('sin `value` marca `defaultValue` y el navegador gestiona la selección', () => {
    render(
      <RadioGroup name="plan" legend="Elige un plan" options={OPTIONS} defaultValue="equipo" />,
    );

    expect(radio('Equipo').checked).toBe(true);
    fireEvent.click(radio('Personal'));
    expect(radio('Personal').checked).toBe(true);
  });

  it('controlado: marca `value` y avisa el cambio con `onValueChange` sin cambiar solo', () => {
    const onValueChange = jest.fn();
    render(
      <RadioGroup
        name="plan"
        legend="Elige un plan"
        options={OPTIONS}
        value="personal"
        onValueChange={onValueChange}
      />,
    );

    expect(radio('Personal').checked).toBe(true);
    fireEvent.click(radio('Equipo'));
    expect(onValueChange).toHaveBeenCalledWith('equipo');
    expect(radio('Personal').checked).toBe(true);
  });
});
