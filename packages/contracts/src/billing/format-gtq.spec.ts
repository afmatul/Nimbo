import { formatGtq } from './format-gtq';

describe('formatGtq (spec 009 RN-1, ADR-0028)', () => {
  it.each([
    [0, 'Q0.00'],
    [5, 'Q0.05'],
    [4500, 'Q45.00'],
    [11_000, 'Q110.00'],
    [12_345, 'Q123.45'],
    [123_456_789, 'Q1\u00A0234\u00A0567.89'],
  ])('RN-1: %i centavos → %s', (cents, text) => {
    expect(formatGtq(cents)).toBe(text);
  });
});
