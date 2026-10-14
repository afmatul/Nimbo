import { randomUUID } from 'node:crypto';

import { BACKOFFICE_PAGE_SIZE } from '@nimbo/contracts';

import { createActor, Role } from '../../../shared';
import { AccountStatus } from '../domain/account-status.enum';
import { AccountNotFoundError } from '../domain/errors';

import { AccountDirectory } from './account-directory';
import type {
  AccountSummary,
  IAccountDirectoryRepository,
} from './ports/i-account-directory.repository.port';

const ADMIN = createActor(randomUUID(), Role.ADMIN);

const aSummary = (id: string): AccountSummary => ({
  id,
  email: `${id}@nimbo.me`,
  fullName: 'Ana López',
  role: Role.CLIENT,
  status: AccountStatus.ACTIVE,
  emailVerified: true,
  usedBytes: 0n,
  createdAt: new Date('2026-10-07T08:00:00.000Z'),
});

const setup = () => {
  const repository: jest.Mocked<IAccountDirectoryRepository> = {
    list: jest.fn(),
    findById: jest.fn(),
    findClientByEmail: jest.fn(),
    statistics: jest.fn(),
    listVerifiedClientIds: jest.fn(),
  };
  return { repository, directory: new AccountDirectory(repository) };
};

describe('AccountDirectory (011 CA-1, CA-4, CA-13)', () => {
  it('CA-1: pide la página con el tamaño del backoffice y marca la cuenta del actor', async () => {
    const { repository, directory } = setup();
    repository.list.mockResolvedValue({ items: [aSummary(ADMIN.id), aSummary('otra')], total: 12 });

    const page = await directory.list(ADMIN, { emailPrefix: 'ana', page: 2 });

    expect(repository.list).toHaveBeenCalledWith({
      emailPrefix: 'ana',
      page: 2,
      pageSize: BACKOFFICE_PAGE_SIZE,
    });
    expect(page).toMatchObject({ page: 2, pageSize: BACKOFFICE_PAGE_SIZE, total: 12 });
    expect(page.items.map((item) => item.isSelf)).toEqual([true, false]);
  });

  it('CA-4: la ficha dice si es la propia cuenta', async () => {
    const { repository, directory } = setup();
    repository.findById.mockResolvedValue(aSummary(ADMIN.id));

    await expect(directory.get(ADMIN, ADMIN.id)).resolves.toMatchObject({ isSelf: true });
  });

  it('CA-2: una cuenta inexistente → `AccountNotFoundError`', async () => {
    const { repository, directory } = setup();
    repository.findById.mockResolvedValue(null);

    await expect(directory.get(ADMIN, randomUUID())).rejects.toBeInstanceOf(AccountNotFoundError);
  });

  it('CA-13: busca al cliente por el correo normalizado', async () => {
    const { repository, directory } = setup();
    repository.findClientByEmail.mockResolvedValue(null);

    await expect(directory.findClientByEmail(ADMIN, ' Ana@Nimbo.ME ')).resolves.toBeNull();
    expect(repository.findClientByEmail.mock.calls[0]?.[0].value).toBe('ana@nimbo.me');
  });
});
