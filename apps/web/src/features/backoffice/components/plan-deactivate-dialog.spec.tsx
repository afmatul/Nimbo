/**
 * @jest-environment jsdom
 */
import type { PlanAdminView } from '@nimbo/contracts';
import { render, screen } from '@testing-library/react';

import { PlanDeactivatedNotice, PlanDeactivateDialog } from './plan-deactivate-dialog';

const planWith = (clientCount: number): PlanAdminView => ({
  id: '10000000-0000-4000-8000-000000000002',
  slug: 'pro',
  name: 'Pro',
  description: 'Plan profesional',
  priceCents: 11000,
  quotaBytes: '375809638400',
  maxFileBytes: '524288000',
  maxEditors: 5,
  agentQueriesPerMonth: 2000,
  retainedVersions: 60,
  trashRetentionDays: 60,
  deactivatedAt: null,
  clientCount,
  isDefault: false,
});

/** El diálogo con el plan abierto, como lo deja el clic en «Desactivar». */
function renderDialog(clientCount: number): void {
  const plan = planWith(clientCount);
  render(
    <PlanDeactivateDialog
      deactivation={{
        asking: plan,
        pending: false,
        done: null,
        failure: null,
        forbidden: false,
        ask: jest.fn(),
        cancel: jest.fn(),
        confirm: jest.fn(),
      }}
    />,
  );
}

describe('los textos de la desactivación (011 CA-10, RN-4)', () => {
  it('con 52 cuentas, el diálogo dice la línea del plan y la consecuencia sin repetir el artículo', () => {
    renderDialog(52);

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Q110.00 al mes · 350 GB · 52 cuentas lo tienen');
    expect(dialog.textContent).toContain(
      'Las 52 cuentas que lo tienen lo conservan con el mismo precio y los mismos límites.',
    );
    expect(dialog.textContent).not.toContain('Las las');
    expect(dialog.textContent).not.toContain('lo tienen lo tienen');
  });

  it('con 1 cuenta, el artículo y el verbo van en singular', () => {
    renderDialog(1);

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('1 cuenta lo tiene');
    expect(dialog.textContent).toContain(
      'La 1 cuenta que lo tiene lo conserva con el mismo precio y los mismos límites.',
    );
  });

  it('con 0 cuentas, el texto no rompe', () => {
    renderDialog(0);

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('0 cuentas lo tienen');
    expect(dialog.textContent).toContain(
      'Las 0 cuentas que lo tienen lo conservan con el mismo precio y los mismos límites.',
    );
  });

  it('el aviso de desactivación usa los mismos textos que el diálogo', () => {
    render(<PlanDeactivatedNotice plan={planWith(52)} />);

    expect(screen.getByText(/Desactivamos el plan Pro\./)).toBeTruthy();
    expect(
      screen.getByText(
        'Las 52 cuentas que lo tienen lo conservan con el mismo precio y los mismos límites.',
      ),
    ).toBeTruthy();
  });
});
