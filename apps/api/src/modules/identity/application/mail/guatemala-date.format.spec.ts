import { formatGuatemalaDateTime } from './guatemala-date.format';

describe('formatGuatemalaDateTime (plan 002 §6.4)', () => {
  it('CA-16: da la fecha y la hora de Guatemala aunque en UTC ya sea el día siguiente', () => {
    expect(formatGuatemalaDateTime(new Date('2026-09-27T02:30:00Z'))).toEqual({
      date: '26/09/2026',
      time: '20:30',
    });
  });

  it('CA-16: usa el reloj de 24 horas con dos dígitos', () => {
    expect(formatGuatemalaDateTime(new Date('2026-01-05T14:07:00Z'))).toEqual({
      date: '05/01/2026',
      time: '08:07',
    });
  });
});
