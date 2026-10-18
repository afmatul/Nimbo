import {
  DEPARTURE_DETECTION_LIMIT_MS,
  REALTIME_PING_INTERVAL_MS,
  REALTIME_PING_TIMEOUT_MS,
} from './realtime-config';

describe('RealtimeConfig (plan §4)', () => {
  it('CA-9: el latido por defecto detecta una caída sin cierre en ≤ 60 s (RN-9)', () => {
    expect(DEPARTURE_DETECTION_LIMIT_MS).toBe(60_000);
    expect(REALTIME_PING_INTERVAL_MS + REALTIME_PING_TIMEOUT_MS).toBeLessThanOrEqual(
      DEPARTURE_DETECTION_LIMIT_MS,
    );
  });
});
