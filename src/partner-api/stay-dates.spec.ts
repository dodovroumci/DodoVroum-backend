import { parseIsoDate, parseStay } from './stay-dates';

describe('Dates de séjour [checkIn, checkOut[', () => {
  const NOW = new Date('2026-11-17T23:30:00.000Z');

  it('séjour valide : minuit UTC et nombre de nuits', () => {
    expect(parseStay('2026-12-20', '2026-12-23', NOW)).toEqual({
      start: new Date('2026-12-20T00:00:00.000Z'),
      end: new Date('2026-12-23T00:00:00.000Z'),
      nights: 3,
      checkIn: '2026-12-20',
      checkOut: '2026-12-23',
    });
  });

  it('arrivée aujourd’hui (UTC) acceptée, hier refusée', () => {
    expect(parseStay('2026-11-17', '2026-11-18', NOW).nights).toBe(1);
    expect(() => parseStay('2026-11-16', '2026-11-18', NOW)).toThrow('passé');
  });

  it('départ égal ou antérieur à l’arrivée refusé', () => {
    expect(() => parseStay('2026-12-20', '2026-12-20', NOW)).toThrow('après');
    expect(() => parseStay('2026-12-20', '2026-12-19', NOW)).toThrow('après');
  });

  it('30 nuits au plus (même limite que la réservation)', () => {
    expect(parseStay('2026-12-01', '2026-12-31', NOW).nights).toBe(30);
    expect(() => parseStay('2026-12-01', '2027-01-01', NOW)).toThrow(
      '30 nuits',
    );
  });

  it('dates impossibles ou mal formées refusées', () => {
    expect(parseIsoDate('2027-02-29')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
    expect(parseIsoDate('2026-12-20T00:00:00Z')).toBeNull();
    expect(() => parseStay('2027-02-30', '2027-03-02', NOW)).toThrow(
      'YYYY-MM-DD',
    );
  });

  it('erreur structurée INVALID_DATE_RANGE (400)', () => {
    try {
      parseStay('2026-12-20', '2026-12-19', NOW);
      fail('exception attendue');
    } catch (error) {
      expect((error as { getStatus(): number }).getStatus()).toBe(400);
      expect((error as { code: string }).code).toBe('INVALID_DATE_RANGE');
    }
  });
});
