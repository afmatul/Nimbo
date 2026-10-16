/**
 * @jest-environment jsdom
 */
import type { Plan } from '@nimbo/contracts';
import { render, screen, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { PlanComparisonTable } from './plan-comparison-table';

const PERSONAL: Plan = {
  id: '10000000-0000-4000-8000-000000000001',
  slug: 'personal',
  name: 'Personal',
  description: null,
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
  priceCents: 4500,
  quotaBytes: '107374182400',
  maxFileBytes: '524288000',
  maxEditors: 5,
  agentQueriesPerMonth: 2000,
  retainedVersions: 30,
  trashRetentionDays: 30,
};

const CA2_ROWS = [
  'Precio mensual',
  'Almacenamiento',
  'Tamaño máximo por archivo',
  'Edición .docx',
  'Editores simultáneos',
  'Consultas al agente',
  'Historial de versiones con autoría',
  'Versiones retenidas',
  'Retención en papelera',
];

expect.extend(toHaveNoViolations);

function cellsOf(rowLabel: string): string[] {
  const row = screen.getByRole('rowheader', { name: rowLabel }).closest('tr');
  if (row === null) throw new Error(`Falta la fila ${rowLabel}`);
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent ?? '');
}

describe('PlanComparisonTable (008 CA-2)', () => {
  beforeEach(() => {
    render(<PlanComparisonTable plans={[PERSONAL, PRO]} />);
  });

  it('CA-2: tiene las nueve filas de CA-2 en orden y una columna por plan', () => {
    expect(screen.getAllByRole('rowheader').map((header) => header.textContent)).toEqual(CA2_ROWS);
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Característica',
      'Personal',
      'Pro',
    ]);
  });

  it('CA-2: Personal con maxEditors 0 es «Solo lectura» y «—» en editores simultáneos', () => {
    expect(cellsOf('Edición .docx')).toEqual(['Solo lectura', 'Sí']);
    expect(cellsOf('Editores simultáneos')).toEqual(['—', '5']);
  });

  it('CA-2: precio en quetzales y bytes legibles desde el contrato', () => {
    expect(cellsOf('Precio mensual')).toEqual(['Q0.00', 'Q45.00']);
    expect(cellsOf('Almacenamiento')).toEqual(['15 GB', '100 GB']);
    expect(cellsOf('Tamaño máximo por archivo')).toEqual(['50 MB', '500 MB']);
  });

  it('CA-2: consultas, versiones, papelera e historial con autoría', () => {
    expect(cellsOf('Consultas al agente')).toEqual(['20 / mes', '2 000 / mes']);
    expect(cellsOf('Versiones retenidas')).toEqual(['5', '30']);
    expect(cellsOf('Retención en papelera')).toEqual(['7 días', '30 días']);
    expect(cellsOf('Historial de versiones con autoría')).toEqual(['Sí', 'Sí']);
  });

  it('no tiene violaciones de accesibilidad', async () => {
    expect(await axe(screen.getByRole('table'))).toHaveNoViolations();
  });
});
