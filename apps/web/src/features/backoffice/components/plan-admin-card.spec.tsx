/**
 * @jest-environment jsdom
 */
import type { PlanAdminView } from '@nimbo/contracts';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { formatCount } from '../../../lib/format-plan';

import { PlanAdminCard } from './plan-admin-card';

expect.extend(toHaveNoViolations);

const PRO: PlanAdminView = {
  id: '10000000-0000-4000-8000-000000000002',
  slug: 'pro',
  name: 'Pro',
  description: 'Plan profesional para usuarios exigentes',
  priceCents: 4500,
  quotaBytes: '100000000000',
  maxFileBytes: '500000000',
  maxEditors: 3,
  agentQueriesPerMonth: 3000,
  retainedVersions: 30,
  trashRetentionDays: 30,
  deactivatedAt: null,
  clientCount: 186,
  isDefault: false,
};

const PERSONAL: PlanAdminView = {
  ...PRO,
  id: '10000000-0000-4000-8000-000000000001',
  slug: 'personal',
  name: 'Personal',
  description: 'Plan gratuito para uso individual',
  priceCents: 0,
  quotaBytes: '15000000000',
  maxFileBytes: '50000000',
  maxEditors: 0,
  agentQueriesPerMonth: 20,
  retainedVersions: 3,
  trashRetentionDays: 7,
  clientCount: 1012,
  isDefault: true,
};

const RETIRED: PlanAdminView = {
  ...PRO,
  name: 'Equipo',
  deactivatedAt: '2026-10-03T12:00:00.000Z',
  clientCount: 52,
};

function factOf(label: string): string | null | undefined {
  return screen.getByText(label).nextElementSibling?.textContent;
}

describe('PlanAdminCard (011 CA-8, PD-83)', () => {
  it('CA-8: muestra los seis límites del catálogo, con sus etiquetas', () => {
    render(<PlanAdminCard plan={PRO} />);

    expect(factOf('Almacenamiento')).toBe('100 GB');
    expect(factOf('Máximo por archivo')).toBe('500 MB');
    expect(factOf('Editores simultáneos')).toBe('3');
    expect(factOf('Consultas al agente')).toBe(`${formatCount(3000)} al mes`);
    expect(factOf('Versiones retenidas')).toBe('30');
    expect(factOf('Días en papelera')).toBe('30 días');
  });

  it('CA-8: un plan sin editores dice «Ninguno» y que la edición es de solo lectura', () => {
    render(<PlanAdminCard plan={PERSONAL} />);

    expect(factOf('Editores simultáneos')).toContain('Ninguno');
    expect(screen.getByText('Edición solo lectura')).toBeTruthy();
  });

  it('CA-8: el estado va con icono y texto, nunca solo color', () => {
    const { rerender } = render(<PlanAdminCard plan={PRO} />);

    expect(screen.getByText('Activo')).toBeTruthy();
    expect(screen.queryByText('Inactivo')).toBeNull();

    rerender(<PlanAdminCard plan={RETIRED} />);

    expect(screen.getByText('Inactivo')).toBeTruthy();
    expect(screen.queryByText('Activo')).toBeNull();
  });

  it('CA-8: el conteo de cuentas va con el separador de miles del catálogo', () => {
    render(<PlanAdminCard plan={PERSONAL} />);

    expect(screen.getByText('1 012 cuentas con este plan')).toBeTruthy();
  });

  it('CA-8: un plan desactivado dice cuántas cuentas lo conservan y desde cuándo', () => {
    render(<PlanAdminCard plan={RETIRED} />);

    expect(screen.getByText('52 cuentas lo conservan')).toBeTruthy();
    expect(screen.getByText('Desactivado el 03/10/2026')).toBeTruthy();
  });

  it('RN-4: el plan por defecto explica que no se puede desactivar (no es un botón apagado)', () => {
    render(<PlanAdminCard plan={PERSONAL} />);

    expect(screen.getByText('Plan por defecto')).toBeTruthy();
    expect(screen.getByText('Es el plan gratuito: no se puede desactivar.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('CA-10: la acción la decide la página (desactivar)', () => {
    render(
      <PlanAdminCard plan={PRO} action={<button type="button">Desactivar el plan Pro</button>} />,
    );

    expect(screen.getByRole('button', { name: 'Desactivar el plan Pro' })).toBeTruthy();
  });

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = render(<PlanAdminCard plan={RETIRED} />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
