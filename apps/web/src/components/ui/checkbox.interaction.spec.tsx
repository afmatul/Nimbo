/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';

import { Checkbox } from './checkbox';

describe('Checkbox en el navegador (CA-6)', () => {
  it('se marca y desmarca con la etiqueta y avisa el cambio', () => {
    const onChange = jest.fn();
    render(<Checkbox label="Aplicar a los demás" onChange={onChange} />);
    const box = screen.getByLabelText<HTMLInputElement>('Aplicar a los demás');

    fireEvent.click(box);
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(box.checked).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
