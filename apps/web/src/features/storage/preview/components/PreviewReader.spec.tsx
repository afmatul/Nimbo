/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';

import { ImagePreview } from './ImagePreview';
import { PreviewReader } from './PreviewReader';
import { TextPreview } from './TextPreview';

jest.mock('./ImagePreview', () => ({ ImagePreview: jest.fn(() => null) }));
jest.mock('./TextPreview', () => ({ TextPreview: jest.fn(() => null) }));

const URL = 'https://objects.test/private-object?X-Amz-Signature=PRIVATE_SIGNATURE';

describe('selección por kind vigente', () => {
  it.each(['imagen', 'texto'] as const)(
    'CA-1: selecciona el lector de %s sin nombre ni extensión',
    (kind) => {
      const onFailure = jest.fn();
      const onReady = jest.fn();
      render(<PreviewReader kind={kind} url={URL} onFailure={onFailure} onReady={onReady} />);
      const selected = jest.mocked(kind === 'imagen' ? ImagePreview : TextPreview);
      expect(selected).toHaveBeenCalledTimes(1);
      const props = selected.mock.calls[0]?.[0];
      expect(props?.url === URL).toBe(true);
      expect(props?.onFailure === onFailure).toBe(true);
      expect(props?.onReady === onReady).toBe(true);
      expect(Object.keys(props ?? {}).sort()).toEqual(['onFailure', 'onReady', 'url']);
      expect(kind === 'imagen' ? TextPreview : ImagePreview).toHaveBeenCalledTimes(0);
    },
  );

  it.each(['pdf', 'xlsx', 'pptx'] as const)(
    'CA-1: %s queda pendiente de su motor, sin falso unsupported',
    (kind) => {
      const onFailure = jest.fn();
      const { container } = render(<PreviewReader kind={kind} url={URL} onFailure={onFailure} />);
      expect(screen.getByRole('status').textContent).toContain('pendiente de integración');
      expect(ImagePreview).toHaveBeenCalledTimes(0);
      expect(TextPreview).toHaveBeenCalledTimes(0);
      expect(onFailure).toHaveBeenCalledTimes(0);
      expect(container.querySelector('iframe,object,embed,img,a')).toBeNull();
      expect(container.innerHTML.includes(URL)).toBe(false);
    },
  );

  it.each(['docx', 'otro'] as const)('CA-11: %s no monta lectores ni publica la URL', (kind) => {
    const { container } = render(<PreviewReader kind={kind} url={URL} onFailure={jest.fn()} />);
    expect(ImagePreview).toHaveBeenCalledTimes(0);
    expect(TextPreview).toHaveBeenCalledTimes(0);
    expect(container.innerHTML).toBe('');
  });
});
