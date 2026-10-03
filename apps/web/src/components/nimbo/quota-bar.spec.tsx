/**
 * @jest-environment jsdom
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { QuotaBar, quotaPercentOf, quotaStateOf, quotaTierOf } from './quota-bar';

const RAW_COLOR =
  /#[0-9a-f]{3,8}\b|\b(?:bg|text|border)-(?:red|blue|green|gray|slate|zinc|neutral|white|black|amber|yellow)\b|\b(?:bg|text|border)-\[/i;

const GB = 1_000_000_000;
const QUOTA = 15 * GB;

let root: Root | undefined;

async function mount(ui: ReactElement): Promise<void> {
  (globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const created = createRoot(container);
  root = created;
  await act(async () => {
    created.render(ui);
  });
}

afterEach(async () => {
  const mounted = root;
  root = undefined;
  if (mounted) {
    await act(async () => {
      mounted.unmount();
    });
  }
  document.body.innerHTML = '';
});

function bar(): Element | null {
  return document.querySelector('[role="progressbar"]');
}

function text(): string {
  return document.body.textContent ?? '';
}

function usedAt(percent: number): number {
  return (QUOTA * percent) / 100;
}

describe('quotaPercentOf y quotaTierOf (CA-5, RN-4)', () => {
  it('CA-5: redondea hacia abajo y limita a 0–100 %', () => {
    expect(quotaPercentOf(usedAt(89.9), QUOTA)).toBe(89);
    expect(quotaPercentOf(usedAt(99.9), QUOTA)).toBe(99);
    expect(quotaPercentOf(QUOTA * 2, QUOTA)).toBe(100);
    expect(quotaPercentOf(0, QUOTA)).toBe(0);
  });

  it('CA-5: sin cuota no hay espacio disponible', () => {
    expect(quotaPercentOf(0, 0)).toBe(100);
  });

  it.each([
    [0, 'normal'],
    [69, 'normal'],
    [70, 'warning'],
    [89, 'warning'],
    [90, 'critical'],
    [99, 'critical'],
    [100, 'full'],
  ] as const)('CA-5: %i %% es el tramo %s', (percent, tier) => {
    expect(quotaTierOf(percent)).toBe(tier);
  });
});

describe('quotaStateOf (CA-5, RN-4)', () => {
  it.each([
    [32, 'normal', null],
    [82, 'warning', 'Tu cuota está al 82 %.'],
    [94, 'critical', 'Espacio casi agotado.'],
    [100, 'full', 'Espacio agotado.'],
  ] as const)('CA-5: al %i %% el tramo es %s con el aviso %s', (percent, tier, notice) => {
    expect(quotaStateOf({ usedBytes: usedAt(percent), quotaBytes: QUOTA })).toEqual({
      percent,
      tier,
      notice,
    });
  });
});

describe('QuotaBar (CA-5)', () => {
  it('CA-5: expone role="progressbar" con valores y GB en texto', async () => {
    await mount(
      <QuotaBar label="Almacenamiento usado" usedBytes={usedAt(32)} quotaBytes={QUOTA} />,
    );

    expect(bar()?.getAttribute('aria-label')).toBe('Almacenamiento usado');
    expect(bar()?.getAttribute('aria-valuemin')).toBe('0');
    expect(bar()?.getAttribute('aria-valuemax')).toBe('100');
    expect(bar()?.getAttribute('aria-valuenow')).toBe('32');
    expect(bar()?.getAttribute('aria-valuetext')).toBe('4,8 GB de 15 GB (32 %)');
    expect(text()).toContain('32 %');
    expect(text()).toContain('4,8 GB de 15 GB');
  });

  it('CA-5: bajo el 70 % usa success y no muestra aviso ni «Liberar espacio»', async () => {
    await mount(
      <QuotaBar label="Uso" usedBytes={usedAt(69)} quotaBytes={QUOTA} freeSpaceHref="/espacio" />,
    );

    expect(document.body.innerHTML).toContain('bg-success');
    expect(document.querySelector('[data-quota-notice]')).toBeNull();
    expect(text()).not.toContain('Liberar espacio');
  });

  it.each([
    [82, 'Tu cuota está al 82 %.', 'bg-warning'],
    [94, 'Espacio casi agotado.', 'bg-destructive-soft'],
    [100, 'Espacio agotado.', 'bg-destructive-soft'],
  ] as const)('CA-5: al %i %% avisa «%s» con ícono y token', async (percent, notice, token) => {
    await mount(<QuotaBar label="Uso" usedBytes={usedAt(percent)} quotaBytes={QUOTA} />);

    const note = document.querySelector('[data-quota-notice]');
    expect(note?.textContent).toBe(notice);
    expect(note?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(document.body.innerHTML).toContain(token);
    expect(text()).toContain(`${percent} %`);
  });

  it('CA-5: en un tramo de aviso ofrece «Liberar espacio» hacia el destino indicado', async () => {
    await mount(
      <QuotaBar label="Uso" usedBytes={usedAt(94)} quotaBytes={QUOTA} freeSpaceHref="/espacio" />,
    );

    const link = Array.from(document.querySelectorAll('a')).find(
      (anchor) => anchor.textContent === 'Liberar espacio',
    );
    expect(link?.getAttribute('href')).toBe('/espacio');
    expect(link?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('CA-5: sin destino no muestra «Liberar espacio» (la pantalla lo ofrece en su aviso)', async () => {
    await mount(<QuotaBar label="Uso" usedBytes={usedAt(94)} quotaBytes={QUOTA} />);

    expect(text()).not.toContain('Liberar espacio');
  });

  it('D-19: el fondo de la barra lleva borde input y solo usa tokens', async () => {
    await mount(<QuotaBar label="Uso" usedBytes={usedAt(82)} quotaBytes={QUOTA} />);

    expect(bar()?.className).toContain('border-input');
    expect(bar()?.className).toContain('bg-muted');
    expect(document.body.innerHTML).not.toMatch(RAW_COLOR);
  });
});
