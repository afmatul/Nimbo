import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import type { FileKind } from '../domain/file-kind';

import type { ISpaceRepository } from './ports/i-space.repository.port';
import type { ITrashRepository, TrashTotals } from './ports/i-trash.repository.port';
import { SpaceMeasurer } from './space-measurer';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);

const spacesWith = (bytesByKind: ReadonlyMap<FileKind, bigint>) => ({
  liveBytesByKind: jest.fn<Promise<ReadonlyMap<FileKind, bigint>>, [Actor]>(() =>
    Promise.resolve(bytesByKind),
  ),
});

const trashWith = (totals: TrashTotals) => ({
  trashSummary: jest.fn<Promise<TrashTotals>, [Actor]>(() => Promise.resolve(totals)),
});

describe('SpaceMeasurer', () => {
  it('CA-2, CA-3: une los bytes vivos por categoría con el total de la papelera, ambos del mismo actor', async () => {
    const spaces = spacesWith(
      new Map<FileKind, bigint>([
        ['pdf', 300n],
        ['docx', 200n],
        ['imagen', 50n],
        ['otro', 7n],
      ]),
    );
    const trash = trashWith({ itemCount: 2, totalBytes: 40n });
    const measurer = new SpaceMeasurer(
      spaces as unknown as ISpaceRepository,
      trash as unknown as ITrashRepository,
    );

    const breakdown = await measurer.measure(ANA);

    expect(breakdown).toMatchObject({
      documentsBytes: 500n,
      imagesBytes: 50n,
      otherBytes: 7n,
      trashBytes: 40n,
    });
    expect(breakdown.totalBytes).toBe(597n);
    expect(spaces.liveBytesByKind).toHaveBeenCalledWith(ANA);
    expect(trash.trashSummary).toHaveBeenCalledWith(ANA);
  });

  it('CA-2: una cuenta sin archivos mide cero en todo', async () => {
    const measurer = new SpaceMeasurer(
      spacesWith(new Map()) as unknown as ISpaceRepository,
      trashWith({ itemCount: 0, totalBytes: 0n }) as unknown as ITrashRepository,
    );

    const breakdown = await measurer.measure(ANA);

    expect(breakdown.totalBytes).toBe(0n);
  });
});
