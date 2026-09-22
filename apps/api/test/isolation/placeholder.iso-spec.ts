// 000 no tiene datos de cliente; 003 agrega las pruebas reales de aislamiento (Art. IX, CA-25).
// Este marcador existe para que el job `isolation` de CI sea real y pueda forzarse a fallar.
describe('suite de aislamiento (marcador)', () => {
  it('CA-25: la suite de aislamiento puede forzarse a fallar con ISOLATION_FORCE_FAIL=1', () => {
    expect(process.env['ISOLATION_FORCE_FAIL']).not.toBe('1');
  });
});
