import {
  publicLinkCeilingOf,
  type SharingConfig,
} from '../../src/modules/sharing/application/sharing-config';

/**
 * Un `SharingConfig` completo para las pruebas unitarias de `sharing` (PD-192): los valores de `.env.example` con los
 * campos que el caso fija. Un campo nuevo de `SharingConfig` se agrega solo aquí.
 */
export const sharingConfigWith = (overrides: Partial<SharingConfig> = {}): SharingConfig => ({
  shareAttemptsPerMinute: 20,
  webPublicUrl: 'https://nimbo.test',
  publicLinkRequestsPerMinute: 30,
  publicLinkLockout: { maxFailures: 5, windowSeconds: 900, lockSeconds: 900 },
  publicLinkCeiling: publicLinkCeilingOf(100),
  ...overrides,
});
