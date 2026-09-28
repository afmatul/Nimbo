import * as identity from './index';
import type { ClientAccountVerifiedEvent } from './index';

describe('API pública de `identity`', () => {
  it('CA-8: exporta solo el nombre del evento de cuenta verificada (plan §5; `IdentityModule` llega en T-45)', () => {
    expect(Object.keys(identity).sort()).toEqual(['CLIENT_ACCOUNT_VERIFIED']);
    expect(identity.CLIENT_ACCOUNT_VERIFIED).toBe('identity.client-account-verified');
  });

  it('CA-8: el evento lleva solo el `userId`, sin correo ni nombre', () => {
    const event: ClientAccountVerifiedEvent = { userId: '6f1e0c3a-1b2d-4e5f-8a9b-0c1d2e3f4a5b' };

    expect(Object.keys(event)).toEqual(['userId']);
  });
});
