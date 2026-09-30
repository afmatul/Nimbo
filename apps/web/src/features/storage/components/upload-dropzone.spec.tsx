/**
 * @jest-environment jsdom
 */
import { act, createRef, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { UploadDropzone } from './upload-dropzone';

const RAW_COLOR =
  /#[0-9a-f]{3,8}\b|\b(?:bg|text|border)-(?:red|blue|green|gray|slate|zinc|neutral|white|black)\b/i;

let root: Root;

async function mount(ui: ReactElement): Promise<void> {
  (globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

function zone(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[data-testid="upload-dropzone"]');
  if (!found) throw new Error('Zona de arrastre no encontrada');
  return found;
}

function fileInput(): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!found) throw new Error('Selector de archivos no encontrado');
  return found;
}

async function dispatchDrag(
  type: 'dragenter' | 'dragover' | 'dragleave' | 'drop',
  files: readonly File[] = [],
): Promise<Event> {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files, types: ['Files'] } });
  await act(async () => {
    zone().dispatchEvent(event);
  });
  return event;
}

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
});

describe('UploadDropzone (CA-1, CA-21)', () => {
  it('CA-1: ofrece un selector de archivos múltiple con nombre accesible', async () => {
    await mount(<UploadDropzone maxFileLabel="25 MB" onFiles={jest.fn()} />);

    expect(fileInput().multiple).toBe(true);
    expect(fileInput().getAttribute('aria-label')).toBe('Elegir archivos para subir');
  });

  it('CA-1: llama onFiles al elegir archivos y limpia el selector para permitir repetirlos', async () => {
    const onFiles = jest.fn();
    await mount(<UploadDropzone maxFileLabel="25 MB" onFiles={onFiles} />);
    const files = [new File(['hola'], 'informe.pdf')];
    Object.defineProperty(fileInput(), 'files', { value: files, configurable: true });

    await act(async () => {
      fileInput().dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onFiles).toHaveBeenCalledWith(files);
    expect(fileInput().value).toBe('');
  });

  it('CA-21: muestra «Suelta para subir» con el máximo del plan mientras se arrastra', async () => {
    await mount(<UploadDropzone maxFileLabel="25 MB" onFiles={jest.fn()} />);

    await dispatchDrag('dragenter');

    expect(document.body.textContent).toContain('Suelta para subir');
    expect(document.body.textContent).toContain(
      'Se guardarán en Mis archivos · hasta 25 MB por archivo',
    );
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Suelta para subir');
    expect(document.body.innerHTML).toContain('border-dashed border-brand bg-brand/5');
  });

  it('CA-1: acepta el arrastre (dragover cancelado) y oculta el aviso al salir', async () => {
    await mount(<UploadDropzone maxFileLabel="25 MB" onFiles={jest.fn()} />);

    await dispatchDrag('dragenter');
    const over = await dispatchDrag('dragover');
    expect(over.defaultPrevented).toBe(true);

    await dispatchDrag('dragleave');
    expect(document.body.textContent).not.toContain('Suelta para subir');
  });

  it('CA-1: llama onFiles al soltar y oculta el aviso', async () => {
    const onFiles = jest.fn();
    await mount(<UploadDropzone maxFileLabel="25 MB" onFiles={onFiles} />);
    const dropped = [new File(['png'], 'foto.png')];

    await dispatchDrag('dragenter');
    const drop = await dispatchDrag('drop', dropped);

    expect(drop.defaultPrevented).toBe(true);
    expect(onFiles).toHaveBeenCalledWith(dropped);
    expect(document.body.textContent).not.toContain('Suelta para subir');
  });

  it('CA-1: no llama onFiles si se suelta sin archivos', async () => {
    const onFiles = jest.fn();
    await mount(<UploadDropzone maxFileLabel="25 MB" onFiles={onFiles} />);

    await dispatchDrag('drop', []);

    expect(onFiles).not.toHaveBeenCalled();
  });

  it('CA-1: expone el selector por ref para abrirlo desde un botón', async () => {
    const inputRef = createRef<HTMLInputElement>();
    await mount(<UploadDropzone maxFileLabel="25 MB" onFiles={jest.fn()} inputRef={inputRef} />);

    expect(inputRef.current).toBe(fileInput());
  });

  it('CA-21: usa solo tokens de Cielo Sereno, sin colores crudos', async () => {
    await mount(<UploadDropzone maxFileLabel="25 MB" onFiles={jest.fn()} />);
    await dispatchDrag('dragenter');

    expect(document.body.innerHTML).not.toMatch(RAW_COLOR);
  });
});
