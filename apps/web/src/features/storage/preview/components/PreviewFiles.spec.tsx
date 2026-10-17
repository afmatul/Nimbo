/** @jest-environment jsdom */
import { render } from '@testing-library/react';

import { PreviewFiles, PreviewMenuItem } from '..';
import { MyFiles } from '../..';

jest.mock('../..', () => ({ ...jest.requireActual('../..'), MyFiles: jest.fn(() => null) }));

describe('composición pública T-06', () => {
  it('CA-7: el wrapper cliente conecta solo props públicas y firstAction', () => {
    render(<PreviewFiles folderId={null} returnFocusId="archivo-17" />);
    expect(MyFiles).toHaveBeenCalledWith(
      { folderId: null, returnFocusId: 'archivo-17', firstAction: PreviewMenuItem },
      undefined,
    );
  });
});
