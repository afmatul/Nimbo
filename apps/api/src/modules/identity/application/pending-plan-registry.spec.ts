import { createActor, Role } from '../../../shared';
import type { ClientUser } from '../domain/client-user.entity';

import { PendingPlanRegistry } from './pending-plan-registry';
import { aClientUser } from './testing/client-user.builder';
import { InMemoryUserRepository } from './testing/in-memory-user.repository';

describe('PendingPlanRegistry', () => {
  it('registro con plan: descarta el plan pendiente de la cuenta del actor y conserva el resto', async () => {
    const users = new InMemoryUserRepository();
    const user = aClientUser().verified().withPendingPlan('pro').build();
    users.seed(user);

    await new PendingPlanRegistry(users).clear(createActor(user.id, Role.CLIENT));

    const stored = (await users.findById(user.id)) as ClientUser;
    expect(stored.pendingPlanSlug).toBeNull();
    expect(stored.emailVerified).toBe(true);
    expect(stored.fullName).toBe(user.fullName);
  });

  it('registro con plan: no toca la cuenta de otro cliente', async () => {
    const users = new InMemoryUserRepository();
    const other = aClientUser().withId('9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d').withEmail('otra@ejemplo.com');
    users.seed(other.withPendingPlan('pro').build());
    const actor = createActor('6f1e0c3a-1b2d-4e5f-8a9b-0c1d2e3f4a5b', Role.CLIENT);

    await new PendingPlanRegistry(users).clear(actor);

    const stored = (await users.findById('9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d')) as ClientUser;
    expect(stored.pendingPlanSlug).toBe('pro');
  });
});
