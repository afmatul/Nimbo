/**
 * @jest-environment jsdom
 */
import type { PlanAdminView } from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { formatCount } from '../../../lib/format-plan';
import { apiError } from '../test-loads';
import { PERSONAL_PLAN, PRO_PLAN, plansResponse, RETIRED_PLAN } from '../test-plans';

import { AdminPlans } from './admin-plans';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const PERSONAL = PERSONAL_PLAN;
const PRO = PRO_PLAN;
const RETIRED = RETIRED_PLAN;

const api = (
  plans: readonly PlanAdminView[],
  deactivate?: (id: string) => Promise<PlanAdminView>,
) => ({
  listPlans: jest.fn(() => Promise.resolve(plansResponse(plans))),
  deactivatePlan: jest.fn((id: string) =>
    deactivate === undefined
      ? Promise.reject(new Error('no se esperaba desactivar'))
      : deactivate(id),
  ),
});

async function renderPlans(
  plans: readonly PlanAdminView[],
  deactivate?: (id: string) => Promise<PlanAdminView>,
): Promise<ReturnType<typeof api>> {
  const backoffice = api(plans, deactivate);
  render(<AdminPlans api={backoffice as never} />);
  await act(async () => undefined);
  return backoffice;
}

describe('AdminPlans (011 CA-8, CA-10, CA-17)', () => {
  it('CA-8: los activos van en su sección y los inactivos en la otra, con su conteo', async () => {
    await renderPlans([PERSONAL, PRO, RETIRED]);

    const active = screen.getByRole('region', { name: 'Planes activos (2)' });
    const inactive = screen.getByRole('region', { name: 'Planes inactivos (1)' });

    expect(within(active).getByRole('heading', { name: 'Personal' })).toBeTruthy();
    expect(within(active).getByRole('heading', { name: 'Pro' })).toBeTruthy();
    expect(within(inactive).getByRole('heading', { name: 'Equipo' })).toBeTruthy();
    expect(screen.getByText('Se ofrecen a quien se registra o cambia de plan.')).toBeTruthy();
    expect(screen.getByText('Ya no se ofrecen; quien los tiene los conserva.')).toBeTruthy();
  });

  it('CA-8: el aviso dice que los planes no se editan y que el cambio queda auditado', async () => {
    await renderPlans([PERSONAL]);

    expect(
      screen.getByText(/Los planes no se editan: crea uno nuevo y desactiva el anterior\./),
    ).toBeTruthy();
    expect(
      screen.getByText('Crear o desactivar un plan queda registrado en la auditoría.'),
    ).toBeTruthy();
  });

  it('CA-8: cada tarjeta lleva su estado, sus límites y sus cuentas', async () => {
    await renderPlans([PRO]);

    expect(screen.getByText('Activo')).toBeTruthy();
    expect(screen.getByText(`${formatCount(186)} cuentas con este plan`)).toBeTruthy();
    expect(screen.getByText('100 GB')).toBeTruthy();
  });

  it('CA-8: sin planes inactivos, un recuadlo lo explica', async () => {
    await renderPlans([PERSONAL]);

    expect(screen.getByText(/Ningún plan está inactivo\./)).toBeTruthy();
  });

  it('RN-4: Personal no ofrece «Desactivar» y explica por qué', async () => {
    await renderPlans([PERSONAL]);

    expect(screen.queryByRole('button', { name: /Desactivar/ })).toBeNull();
    expect(screen.getByText('Plan por defecto')).toBeTruthy();
  });

  it('CA-10: «Desactivar» pide confirmación y avisa de las consecuencias', async () => {
    await renderPlans([PRO]);

    await userEvent.click(screen.getByRole('button', { name: 'Desactivar el plan Pro' }));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('¿Desactivar el plan Pro?')).toBeTruthy();
    expect(within(dialog).getByText(/Deja de ofrecerse/)).toBeTruthy();
    expect(within(dialog).getByText(/No se puede volver a activar/)).toBeTruthy();
  });

  it('CA-10: confirmar desactiva el plan, lo mueve a inactivos y deja el aviso', async () => {
    const deactivated: PlanAdminView = { ...PRO, deactivatedAt: '2026-10-20T12:00:00.000Z' };
    const backoffice = await renderPlans([PERSONAL, PRO], () => Promise.resolve(deactivated));

    await userEvent.click(screen.getByRole('button', { name: 'Desactivar el plan Pro' }));
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar plan' }));
    await act(async () => undefined);

    expect(backoffice.deactivatePlan).toHaveBeenCalledWith(PRO.id);
    expect(screen.getByText(/Desactivamos el plan Pro\./)).toBeTruthy();
    const inactive = screen.getByRole('region', { name: 'Planes inactivos (1)' });
    expect(within(inactive).getByRole('heading', { name: 'Pro' })).toBeTruthy();
  });

  it('CA-14: un 403 muestra «Sin permiso»', async () => {
    const backoffice = {
      listPlans: jest.fn(() => Promise.reject(apiError(403, 'SHARED_FORBIDDEN'))),
      deactivatePlan: jest.fn(),
    };
    render(<AdminPlans api={backoffice as never} />);
    await act(async () => undefined);

    expect(screen.getByRole('heading', { name: 'Sin permiso' })).toBeTruthy();
  });

  it('CA-17: cargando dice «Cargando el catálogo…»', async () => {
    const backoffice = {
      listPlans: jest.fn(() => new Promise(() => undefined)),
      deactivatePlan: jest.fn(),
    };
    render(<AdminPlans api={backoffice as never} />);

    expect(screen.getByRole('status').textContent).toContain('Cargando el catálogo…');
  });

  it('CA-17: el error ofrece «Reintentar» y vuelve a pedir el catálogo', async () => {
    const backoffice = {
      listPlans: jest
        .fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(plansResponse([PERSONAL])),
      deactivatePlan: jest.fn(),
    };
    render(<AdminPlans api={backoffice as never} />);
    await act(async () => undefined);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('No pudimos cargar el catálogo.');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await act(async () => undefined);

    expect(backoffice.listPlans).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { name: 'Personal' })).toBeTruthy();
  });
});
