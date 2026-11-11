import type { OptimizationStatus } from '@nimbo/contracts';

import type { OptimizerApi } from './optimizer-api';

export const IMAGE_FILE_ID = '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b';

export function optimizationStatus(
  overrides: Partial<OptimizationStatus> = {},
): OptimizationStatus {
  return {
    id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    state: 'estimada',
    reason: null,
    originalBytes: 4_800_000,
    estimatedBytes: 2_900_000,
    resultBytes: null,
    savedBytes: 1_900_000,
    savedPercent: 39.5,
    keepOriginalDays: 7,
    pollAfterMs: null,
    updatedAt: '2026-10-27T16:00:00.000Z',
    ...overrides,
  };
}

export const ESTIMATING = optimizationStatus({
  state: 'estimando',
  estimatedBytes: null,
  savedBytes: null,
  savedPercent: null,
  keepOriginalDays: null,
  pollAfterMs: 1700,
});
export const OPTIMIZING = optimizationStatus({
  state: 'optimizando',
  keepOriginalDays: null,
  pollAfterMs: 2300,
});
export const COMPLETED = optimizationStatus({
  state: 'completada',
  resultBytes: 2_900_000,
  keepOriginalDays: null,
});

export function fakeOptimizerApi(overrides: Partial<OptimizerApi> = {}): jest.Mocked<OptimizerApi> {
  return {
    status: jest.fn(() => Promise.resolve(null)),
    estimate: jest.fn(() => Promise.resolve(ESTIMATING)),
    run: jest.fn(() => Promise.resolve(OPTIMIZING)),
    ...overrides,
  } as jest.Mocked<OptimizerApi>;
}
