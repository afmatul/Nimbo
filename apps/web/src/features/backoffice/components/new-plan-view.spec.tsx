/**
 * @jest-environment jsdom
 */
import type { PlanAdminView } from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiClientError } from '../../../lib/api-error';
import { apiError } from '../test-loads';
import { PERSONAL_PLAN, PRO_PLAN } from '../test-plans';

import { NewPlanView } from './new-plan-view';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const CREATED: PlanAdminView = {
  ...PRO_PLAN,
  id: '10000000-0000-4000-8000-000000000009',
  slug: 'equipo-2027',
  name: 'Equipo 2027',
  priceCents: 12500,
  deactivatedAt: null,
  clientCount: 0,
  isDefault: false,
};

/** La API del catálogo: la lista, el alta y (para el tipo) la desactivación. */
const api = (create: () => Promise<PlanAdminView>) => ({
  listPlans: jest.fn(() => Promise.resolve({ items: [PERSONAL_PLAN, PRO_PLAN] })),
  createPlan: jest.fn(() => create()),
  deactivatePlan: jest.fn(),
});

async function renderNewPlan(create: () => Promise<PlanAdminView>) {
  const backoffice = api(create);
  render(<NewPlanView api={backoffice as never} />);
  await act(async () => undefined);
  return backoffice;
}

/** Llena el formulario con los valores de un plan de ejemplo. */
async function fillForm(): Promise<void> {
  await userEvent.type(screen.getByLabelText('Nombre'), 'Equipo 2027');
  await userEvent.type(
    screen.getByLabelText('Descripción'),
    'Para equipos que necesitan más espacio',
  );
  await userEvent.type(screen.getByLabelText('Precio al mes, en quetzales'), '125.00');
  await userEvent.type(screen.getByLabelText('Almacenamiento'), '500');
  await userEvent.type(screen.getByLabelText('Máximo por archivo'), '1');
  await userEvent.type(screen.getByLabelText('Editores simultáneos'), '5');
  await userEvent.type(screen.getByLabelText('Consultas al agente'), '3000');
  await userEvent.type(screen.getByLabelText('Versiones retenidas'), '60');
  await userEvent.type(screen.getByLabelText('Días en papelera'), '60');
}

describe('NewPlanView (011 CA-9, CA-11, CA-17)', () => {
  it('CA-9: el formulario tiene los nueve campos y su aviso de inmutabilidad', async () => {
    await renderNewPlan(() => Promise.resolve(CREATED));

    expect(screen.getByRole('heading', { level: 1, name: 'Nuevo plan' })).toBeTruthy();
    expect(screen.getByLabelText('Nombre')).toBeTruthy();
    expect(screen.getByLabelText('Descripción')).toBeTruthy();
    expect(screen.getByLabelText('Precio al mes, en quetzales')).toBeTruthy();
    expect(screen.getByLabelText('Almacenamiento')).toBeTruthy();
    expect(screen.getByLabelText('Máximo por archivo')).toBeTruthy();
    expect(screen.getByLabelText('Editores simultáneos')).toBeTruthy();
    expect(screen.getByLabelText('Consultas al agente')).toBeTruthy();
    expect(screen.getByLabelText('Versiones retenidas')).toBeTruthy();
    expect(screen.getByLabelText('Días en papelera')).toBeTruthy();
    expect(screen.getByText(/el precio y los límites no cambian/)).toBeTruthy();
    expect(screen.getByText('La creación queda registrada en la auditoría.')).toBeTruthy();
  });

  it('CA-9: enviar crea el plan con el precio en centavos y los bytes en su unidad', async () => {
    const backoffice = await renderNewPlan(() => Promise.resolve(CREATED));

    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Crear plan' }));
    await act(async () => undefined);

    expect(backoffice.createPlan).toHaveBeenCalledWith({
      name: 'Equipo 2027',
      description: 'Para equipos que necesitan más espacio',
      priceCents: 12500,
      quotaBytes: String(500 * 1024 ** 3),
      maxFileBytes: String(1 * 1024 ** 3),
      maxEditors: 5,
      agentQueriesPerMonth: 3000,
      retainedVersions: 60,
      trashRetentionDays: 60,
    });
    expect(screen.getByText(/Creamos el plan Equipo 2027\./)).toBeTruthy();
  });

  it('CA-11: el 422 con los campos se muestra tal cual y lo escrito no se pierde', async () => {
    const backoffice = await renderNewPlan(() =>
      Promise.reject(
        apiError(422, 'BILLING_PLAN_INVALID', [
          { field: 'name', reason: 'NAME_TAKEN', message: 'Ya existe un plan con este nombre.' },
          { field: 'quotaBytes', reason: 'NOT_POSITIVE', message: 'Usa un valor mayor que cero.' },
        ]),
      ),
    );

    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Crear plan' }));
    await act(async () => undefined);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Revisa 2 campos para crear el plan.');
    expect(within(alert).getByText('Ya existe un plan con este nombre.')).toBeTruthy();
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Equipo 2027');
    expect(backoffice.createPlan).toHaveBeenCalledTimes(1);
  });

  it('CA-11: un campo vacío o con letras se avisa antes de enviar', async () => {
    const backoffice = await renderNewPlan(() => Promise.resolve(CREATED));

    await userEvent.click(screen.getByRole('button', { name: 'Crear plan' }));
    await act(async () => undefined);

    expect(screen.getAllByText('Escribe el nombre del plan.').length).toBeGreaterThan(0);
    expect(backoffice.createPlan).not.toHaveBeenCalled();
  });

  it('CA-9: «partir de un plan activo» llena el formulario con sus valores', async () => {
    await renderNewPlan(() => Promise.resolve(CREATED));

    await userEvent.selectOptions(
      screen.getByLabelText('Partir de un plan activo (opcional)'),
      PRO_PLAN.id,
    );

    // El nombre se deja vacío: tiene que ser distinto del plan de origen.
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Precio al mes, en quetzales') as HTMLInputElement).value).toBe(
      '45.00',
    );
  });

  it('CA-14: un 403 muestra «Sin permiso»', async () => {
    const backoffice = {
      listPlans: jest.fn(() =>
        Promise.reject(
          new ApiClientError({
            status: 403,
            code: 'SHARED_FORBIDDEN',
            message: 'x',
            correlationId: 'c',
          }),
        ),
      ),
      createPlan: jest.fn(),
      deactivatePlan: jest.fn(),
    };
    render(<NewPlanView api={backoffice as never} />);
    await act(async () => undefined);

    expect(screen.getByRole('heading', { name: 'Sin permiso' })).toBeTruthy();
  });

  it('N-1: un error del servidor al crear se muestra con su aviso (un 500 no deja la pantalla muda)', async () => {
    const backoffice = await renderNewPlan(() => Promise.reject(new TypeError('Failed to fetch')));

    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Crear plan' }));
    await act(async () => undefined);

    expect(screen.getByRole('alert').textContent).toContain('No pudimos crear el plan.');
    expect(backoffice.createPlan).toHaveBeenCalledTimes(1);
  });

  it('N-1: un 403 al crear lleva a «Sin permiso»', async () => {
    await renderNewPlan(() => Promise.reject(apiError(403, 'SHARED_FORBIDDEN')));

    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Crear plan' }));
    await act(async () => undefined);

    expect(screen.getByRole('heading', { name: 'Sin permiso' })).toBeTruthy();
  });

  it('N-2: el precio con coma decimal no se multiplica por cien', async () => {
    const backoffice = await renderNewPlan(() => Promise.resolve(CREATED));

    await fillForm();
    await userEvent.clear(screen.getByLabelText('Precio al mes, en quetzales'));
    await userEvent.type(screen.getByLabelText('Precio al mes, en quetzales'), '125,50');
    await userEvent.click(screen.getByRole('button', { name: 'Crear plan' }));
    await act(async () => undefined);

    expect(backoffice.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ priceCents: 12550 }),
    );
  });

  it('N-4: un solo número mal escrito marca solo ese campo', async () => {
    await renderNewPlan(() => Promise.resolve(CREATED));

    await fillForm();
    await userEvent.clear(screen.getByLabelText('Precio al mes, en quetzales'));
    await userEvent.type(screen.getByLabelText('Precio al mes, en quetzales'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Crear plan' }));
    await act(async () => undefined);

    expect(screen.getByRole('alert').textContent).toContain('Revisa 1 campo para crear el plan.');
  });

  it('N-6: tras crear desde un plan, se ofrece desactivar el de origen', async () => {
    await renderNewPlan(() => Promise.resolve(CREATED));

    await userEvent.selectOptions(
      screen.getByLabelText('Partir de un plan activo (opcional)'),
      PRO_PLAN.id,
    );
    // El nombre va escrito (el de origen no sirve) y el precio, que venía copiado.
    await userEvent.type(screen.getByLabelText('Nombre'), 'Equipo 2027');
    await userEvent.clear(screen.getByLabelText('Precio al mes, en quetzales'));
    await userEvent.type(screen.getByLabelText('Precio al mes, en quetzales'), '125.00');
    await userEvent.click(screen.getByRole('button', { name: 'Crear plan' }));
    await act(async () => undefined);

    expect(screen.getByText('Si lo reemplaza, desactiva Pro.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Desactivar Pro' })).toBeTruthy();
  });
});
