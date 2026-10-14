import * as identity from './index';
import type { ClientAccountVerifiedEvent } from './index';

describe('API pública de `identity`', () => {
  it('CA-8: exporta el módulo, los *throttlers* para `AppModule`, el nombre del evento de cuenta verificada (plan §5) las fachadas del backoffice (011 plan §2) y la fachada y el módulo del `worker` para la conciliación de `billing` (009 CA-2)', () => {
    expect(Object.keys(identity).sort()).toEqual([
      'AccountAdministration',
      'AccountDirectory',
      'CLIENT_ACCOUNT_VERIFIED',
      'IDENTITY_THROTTLERS',
      'IdentityModule',
      'IdentityWorkerModule',
      'InternalAccountEnrollment',
      'VerifiedClientLister',
    ]);
    expect(identity.CLIENT_ACCOUNT_VERIFIED).toBe('identity.client-account-verified');
  });

  it('CA-8: el evento lleva solo el `userId`, sin correo ni nombre', () => {
    const event: ClientAccountVerifiedEvent = { userId: '6f1e0c3a-1b2d-4e5f-8a9b-0c1d2e3f4a5b' };

    expect(Object.keys(event)).toEqual(['userId']);
  });
});
