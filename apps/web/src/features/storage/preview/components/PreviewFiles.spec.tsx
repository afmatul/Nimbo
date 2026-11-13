/** @jest-environment jsdom */
import { render } from '@testing-library/react';

import { PreviewFiles, PreviewMenuItem } from '..';
import { MyFiles } from '../..';
import { useSessionSharingApi } from '../../../sharing';

jest.mock('../..', () => ({ ...jest.requireActual('../..'), MyFiles: jest.fn(() => null) }));
jest.mock('../../../identity/session/use-auth-fetch', () => ({ useAuthFetch: () => jest.fn() }));
jest.mock('../../../sharing', () => ({
  ...jest.requireActual('../../../sharing'),
  useSessionSharingApi: jest.fn(),
}));

describe('composición pública T-06', () => {
  it('CA-7: el wrapper cliente conecta solo props públicas, la API de compartición y firstAction', () => {
    const sharingApi = { marker: 'sharing-api' };
    jest.mocked(useSessionSharingApi).mockReturnValue(sharingApi as never);

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
        firstAction: PreviewMenuItem,
        renderQuickLook: expect.any(Function),
      },
      undefined,
    );
  });
});
