/**
 * @jest-environment jsdom
 */
import type { Plan } from '@nimbo/contracts';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { PlanCard } from './plan-card';

const PERSONAL: Plan = {
  id: '10000000-0000-4000-8000-000000000001',
  slug: 'personal',
  name: 'Personal',
  description: 'Para uso individual',
  priceCents: 0,
  quotaBytes: '16106127360',
  maxFileBytes: '52428800',
  maxEditors: 0,
  agentQueriesPerMonth: 20,
  retainedVersions: 5,
  trashRetentionDays: 7,
};

const PRO: Plan = {
  ...PERSONAL,
  id: '10000000-0000-4000-8000-000000000002',
  slug: 'pro',
  name: 'Pro',
  description: null,
  priceCents: 4500,
  quotaBytes: '107374182400',
  maxFileBytes: '524288000',
  maxEditors: 5,
};

expect.extend(toHaveNoViolations);

function factOf(label: string): string | null | undefined {
  return screen.getByText(label).nextElementSibling?.textContent;
}

describe('PlanCard (008 CA-2)', () => {
  it('CA-2: Personal muestra nombre, descripción, Q0.00 «al mes» y «Solo lectura»', () => {
    render(<PlanCard plan={PERSONAL} />);

    expect(screen.getByRole('heading', { name: 'Personal' })).toBeTruthy();
    expect(screen.getByText('Para uso individual')).toBeTruthy();
    expect(screen.getByText('Q0.00')).toBeTruthy();
    expect(screen.getByText('al mes')).toBeTruthy();
    expect(factOf('Edición .docx')).toBe('Solo lectura');
  });

  it('CA-2: el precio y los bytes salen del contrato: Q45.00, 100 GB y 500 MB', () => {
    render(<PlanCard plan={PRO} />);

    expect(screen.getByText('Q45.00')).toBeTruthy();
    expect(factOf('Almacenamiento')).toBe('100 GB');
    expect(factOf('Archivo máx.')).toBe('500 MB');
    expect(factOf('Edición .docx')).toBe('Sí');
  });

  it('CA-2: un plan fuera de la semilla se pinta con sus propios valores (nada escrito a mano)', () => {
    render(
      <PlanCard
        plan={{
          ...PRO,
          slug: 'empresarial',
          name: 'Empresarial',
          priceCents: 12345,
          quotaBytes: '2199023255552',
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Empresarial' })).toBeTruthy();
    expect(screen.getByText('Q123.45')).toBeTruthy();
    expect(factOf('Almacenamiento')).toBe('2 TB');
  });

  it('009 CA-9: muestra la acción que le pasa la página debajo de los límites', () => {
    render(<PlanCard plan={PRO} action={<a href="/planes/contratar?slug=pro">Contratar</a>} />);

    expect(screen.getByRole('link', { name: 'Contratar' }).getAttribute('href')).toBe(
      '/planes/contratar?slug=pro',
    );
  });

  it('009 CA-9: sin acción no muestra ningún enlace', () => {
    render(<PlanCard plan={PERSONAL} />);

    expect(screen.queryByRole('link')).toBeNull();
  });

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = render(<PlanCard plan={PERSONAL} />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
