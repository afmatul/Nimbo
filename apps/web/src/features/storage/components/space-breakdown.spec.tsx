/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';

import { GB, spaceSummaryWith } from '../test-space-summary';

import { SpaceBreakdown } from './space-breakdown';

const ROW_NAMES = ['Documentos', 'Imágenes', 'Otros', 'Papelera', 'Cargas en curso', 'Disponible'];

function rows(): HTMLElement[] {
  const region = screen.getByRole('region', { name: 'En qué se va tu espacio' });
  return within(region).getAllByRole('listitem');
}

function rowNamed(name: string): HTMLElement {
  const row = rows().find((item) => item.textContent?.startsWith(name));
  if (!row) throw new Error(`Sin fila ${name}`);
  return row;
}

describe('SpaceBreakdown', () => {
  it('CA-2: Documentos, Imágenes y Otros con formatos, tamaño y porcentaje del usado; luego Disponible', () => {
    render(<SpaceBreakdown summary={spaceSummaryWith(4.8 * GB)} />);

    expect(
      rows().map((row) => ROW_NAMES.find((name) => row.textContent?.startsWith(name))),
    ).toEqual(['Documentos', 'Imágenes', 'Otros', 'Papelera', 'Disponible']);
    expect(rowNamed('Documentos').textContent).toContain('.docx, .pdf, .txt, .md, .xlsx y .pptx');
    expect(rowNamed('Documentos').textContent).toContain('2,9 GB');
    expect(rowNamed('Documentos').textContent).toContain('60 % del usado');
    expect(rowNamed('Imágenes').textContent).toContain('1,4 GB');
    expect(rowNamed('Otros').textContent).toContain('480 MB');
    expect(rowNamed('Disponible').textContent).toContain('10,2 GB');
  });

  it('CA-2: la barra apilada es decorativa (aria-hidden); las cifras van en la lista', () => {
    const { container } = render(<SpaceBreakdown summary={spaceSummaryWith(4.8 * GB)} />);

    const stack = container.querySelector('[data-space-stack]');
    expect(stack?.getAttribute('aria-hidden')).toBe('true');
    expect(stack?.children).toHaveLength(3);
    expect(stack?.className).toContain('border-input');
  });

  it('CA-3: la papelera con espacio es un segmento aparte que cuenta en la cuota, con «Ver papelera»', () => {
    const { container } = render(
      <SpaceBreakdown summary={spaceSummaryWith(7 * GB, { trashBytes: 2.6 * GB })} />,
    );

    const trash = rowNamed('Papelera');
    expect(trash.textContent).toContain('2,6 GB');
    expect(trash.textContent).toContain('37 % del usado');
    expect(trash.textContent).toContain(
      'Cuenta en tu cuota hasta que la vacías o pasan 7 días desde que moviste cada elemento.',
    );
    expect(within(trash).getByRole('link', { name: 'Ver papelera' }).getAttribute('href')).toBe(
      '/papelera',
    );
    expect(container.querySelector('[data-space-stack]')?.children).toHaveLength(4);
  });

  it('CA-3: la papelera vacía dice «Está vacía.» sin enlace', () => {
    render(<SpaceBreakdown summary={spaceSummaryWith(4.8 * GB)} />);

    expect(rowNamed('Papelera').textContent).toContain('Está vacía.');
    expect(within(rowNamed('Papelera')).queryByRole('link')).toBeNull();
  });

  it('D-5: «Cargas en curso» solo aparece con reservas y completa la cuota con Disponible', () => {
    render(<SpaceBreakdown summary={spaceSummaryWith(4.8 * GB, { reservedBytes: 0.3 * GB })} />);

    expect(rowNamed('Cargas en curso').textContent).toContain('300 MB');
    expect(rowNamed('Disponible').textContent).toContain('9,9 GB');
  });

  it('D-5: sin reservas no hay fila «Cargas en curso»', () => {
    render(<SpaceBreakdown summary={spaceSummaryWith(4.8 * GB)} />);

    expect(screen.queryByText('Cargas en curso')).toBeNull();
  });

  it('CA-2: sin nada usado los porcentajes son 0 %', () => {
    render(<SpaceBreakdown summary={spaceSummaryWith(0)} />);

    expect(rowNamed('Documentos').textContent).toContain('0 % del usado');
  });
});
