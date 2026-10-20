import { createActor, Role } from '../../../shared';

import { AccountContactReader } from './account-contact-reader';
import type { IAccountDirectoryRepository } from './ports/i-account-directory.repository.port';

const ANA = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);

const reader = (found: { email: string } | null) =>
  new AccountContactReader({
    findById: jest.fn().mockResolvedValue(found),
  } as unknown as IAccountDirectoryRepository);

describe('AccountContactReader (spec 009 CA-6; metadatos propios, architecture.md §6)', () => {
  it('CA-6: devuelve el correo de la propia cuenta del actor', async () => {
    await expect(reader({ email: 'ana@ejemplo.com' }).contactOf(ANA)).resolves.toBe(
      'ana@ejemplo.com',
    );
  });

  it('CA-6: si la cuenta no existe, falla (el cobro se revierte)', async () => {
    await expect(reader(null).contactOf(ANA)).rejects.toThrow();
  });
});
