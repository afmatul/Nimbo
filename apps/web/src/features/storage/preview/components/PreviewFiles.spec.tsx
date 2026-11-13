/** @jest-environment jsdom */
import { render } from '@testing-library/react';

import { PreviewFiles, PreviewMenuItem } from '..';
import { MyFiles, useSessionBatchApi } from '../..';
import { useSessionSharingApi } from '../../../sharing';

jest.mock('../..', () => ({
  ...jest.requireActual('../..'),
  MyFiles: jest.fn(() => null),
  useSessionBatchApi: jest.fn(),
}));
jest.mock('../../../sharing', () => ({
  ...jest.requireActual('../../../sharing'),
  useSessionSharingApi: jest.fn(),
}));

describe('composición pública T-06', () => {
  it('CA-7: el wrapper cliente conecta solo props públicas, las API de compartición y de lotes y firstAction', () => {
    const sharingApi = { marker: 'sharing-api' };
    const batchApi = { marker: 'batch-api' };
    jest.mocked(useSessionSharingApi).mockReturnValue(sharingApi as never);
    jest.mocked(useSessionBatchApi).mockReturnValue(batchApi as never);

    render(
      <PreviewFiles
        apiPublicUrl="http://localhost/api/v1"
        folderId={null}
        returnFocusId="archivo-17"
      />,
    );

    expect(useSessionSharingApi).toHaveBeenCalledWith('http://localhost/api/v1');
    expect(MyFiles).toHaveBeenCalledWith(
      {
        folderId: null,
        returnFocusId: 'archivo-17',
        sharingApi,
        batchApi,
        firstAction: PreviewMenuItem,
      },
      undefined,
    );
  });
});
