import { describe, it, expect, vi } from 'vitest';

vi.mock('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
  getDoc: vi.fn(),
  doc: vi.fn()
}));

vi.mock('../../src/state.js', () => ({
  state: {}
}));

vi.mock('../../src/utils/escape.js', () => ({
  escapeHtml: vi.fn(x => x),
  escapeAttr: vi.fn(x => x)
}));

vi.mock('../../src/utils/dates.js', () => ({
  getWeekDays: vi.fn(() => []),
  formatDateYYYYMMDD: vi.fn(() => '2026-07-09'),
  isPastDate: vi.fn((date, hour) => {
    const pastDates = ['2020-01-01', '2020-06-15'];
    return pastDates.includes(date);
  })
}));

const { classifySlot } = await import('../../src/calendar/calendar.js');

describe('classifySlot', () => {
  const futureDate = '2099-12-31';

  it('clasifica como past si la fecha/hora ya pasó', () => {
    const result = classifySlot('2020-01-01', 10, [], null);
    expect(result.type).toBe('past');
    expect(result.disabled).toBe(true);
  });

  it('clasifica como blocked si hay reserva bloqueada', () => {
    const reservations = [{ status: 'blocked' }];
    const result = classifySlot(futureDate, 10, reservations, null);
    expect(result.type).toBe('blocked');
    expect(result.disabled).toBe(true);
  });

  it('clasifica como my-approved si el grupo del usuario tiene reserva aprobada', () => {
    const reservations = [
      { groupName: 'G1', status: 'approved' }
    ];
    const userState = { groupName: 'G1' };
    const result = classifySlot(futureDate, 10, reservations, userState);
    expect(result.type).toBe('my-approved');
    expect(result.label).toBe('Agendado');
    expect(result.disabled).toBe(false);
  });

  it('clasifica como my-pending si el grupo del usuario tiene reserva pendiente', () => {
    const reservations = [
      { groupName: 'G1', status: 'pending' }
    ];
    const userState = { groupName: 'G1' };
    const result = classifySlot(futureDate, 10, reservations, userState);
    expect(result.type).toBe('my-pending');
    expect(result.label).toBe('Pendiente');
    expect(result.disabled).toBe(false);
  });

  it('clasifica como full si hay 4 o más grupos aprobados', () => {
    const reservations = [
      { groupName: 'G1', status: 'approved' },
      { groupName: 'G2', status: 'approved' },
      { groupName: 'G3', status: 'approved' },
      { groupName: 'G4', status: 'approved' }
    ];
    const result = classifySlot(futureDate, 10, reservations, null);
    expect(result.type).toBe('full');
    expect(result.disabled).toBe(true);
  });

  it('clasifica como partial si hay entre 1-3 grupos aprobados', () => {
    const reservations = [
      { groupName: 'G1', status: 'approved' },
      { groupName: 'G2', status: 'approved' }
    ];
    const result = classifySlot(futureDate, 10, reservations, null);
    expect(result.type).toBe('partial');
    expect(result.occupancy).toBe(2);
    expect(result.disabled).toBe(false);
  });

  it('clasifica como free si no hay reservas', () => {
    const result = classifySlot(futureDate, 10, [], null);
    expect(result.type).toBe('free');
    expect(result.label).toBe('Disponible');
    expect(result.disabled).toBe(false);
  });

  it('retorna blocked incluso con otros estados mezclados', () => {
    const reservations = [
      { groupName: 'G1', status: 'blocked' },
      { groupName: 'G2', status: 'approved' }
    ];
    const result = classifySlot(futureDate, 10, reservations, null);
    expect(result.type).toBe('blocked');
  });

  it('past tiene prioridad sobre blocked', () => {
    const result = classifySlot('2020-06-15', 10, [{ status: 'blocked' }], null);
    expect(result.type).toBe('past');
  });
});
