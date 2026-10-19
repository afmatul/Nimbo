/** @jest-environment jsdom */
import { render } from '@testing-library/react';

import { ImagePreview } from './ImagePreview';
import { PdfPreview } from './PdfPreview';
import { PresentationPreview } from './PresentationPreview';
import { PreviewReader } from './PreviewReader';
import { SpreadsheetPreview } from './SpreadsheetPreview';
import { TextPreview } from './TextPreview';

jest.mock('./ImagePreview', () => ({ ImagePreview: jest.fn(() => null) }));
jest.mock('./PdfPreview', () => ({ PdfPreview: jest.fn(() => null) }));
jest.mock('./TextPreview', () => ({ TextPreview: jest.fn(() => null) }));
jest.mock('./SpreadsheetPreview', () => ({ SpreadsheetPreview: jest.fn(() => null) }));
jest.mock('./PresentationPreview', () => ({ PresentationPreview: jest.fn(() => null) }));

const URL = 'https://objects.test/private-object?X-Amz-Signature=PRIVATE_SIGNATURE';
const READERS = {
  imagen: ImagePreview,
  texto: TextPreview,
  pdf: PdfPreview,
  xlsx: SpreadsheetPreview,
  pptx: PresentationPreview,
} as const;

describe('selección por kind vigente', () => {
  it.each(['imagen', 'texto', 'pdf', 'xlsx', 'pptx'] as const)(
    'CA-1: selecciona el lector de %s sin nombre ni extensión',
    (kind) => {
      const onFailure = jest.fn();
      const onReady = jest.fn();
      render(<PreviewReader kind={kind} url={URL} onFailure={onFailure} onReady={onReady} />);
      const selected = READERS[kind] as unknown as jest.Mock<null, [Record<string, unknown>]>;
      expect(selected).toHaveBeenCalledTimes(1);
      const props = selected.mock.calls[0]?.[0];
      expect(props?.url === URL).toBe(true);
      expect(props?.onFailure === onFailure).toBe(true);
      expect(props?.onReady === onReady).toBe(true);
      expect(Object.keys(props ?? {}).sort()).toEqual(['onFailure', 'onReady', 'url']);
      for (const reader of Object.values(READERS))
        if (reader !== READERS[kind]) expect(reader).toHaveBeenCalledTimes(0);
    },
  );

  it.each(['docx', 'otro'] as const)('CA-11: %s no monta lectores ni publica la URL', (kind) => {
    const { container } = render(<PreviewReader kind={kind} url={URL} onFailure={jest.fn()} />);
    for (const reader of Object.values(READERS)) expect(reader).toHaveBeenCalledTimes(0);
    expect(container.innerHTML).toBe('');
  });
});
