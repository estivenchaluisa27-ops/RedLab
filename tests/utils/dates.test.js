import { describe, it, expect, vi, afterEach } from 'vitest';
import { getWeekDays, formatDateYYYYMMDD, isPastDate } from '../../src/utils/dates.js';

describe('getWeekDays', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna 5 días (lun-vie)', () => {
    const days = getWeekDays(0);
    expect(days).toHaveLength(5);
  });

  it('el primer día es lunes', () => {
    const days = getWeekDays(0);
    expect(days[0].getDay()).toBe(1); // 1 = Monday
  });

  it('el último día es viernes', () => {
    const days = getWeekDays(0);
    expect(days[4].getDay()).toBe(5); // 5 = Friday
  });

  it('offset 0 incluye hoy', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T12:00:00')); // miércoles
    const days = getWeekDays(0);
    const dates = days.map(d => d.toISOString().slice(0, 10));
    expect(dates).toContain('2026-07-08');
  });

  it('offset -1 es la semana anterior', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T12:00:00'));
    const days = getWeekDays(-1);
    expect(days[4].toISOString().slice(0, 10)).toBe('2026-07-03');
  });

  it('offset 1 es la semana siguiente', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T12:00:00'));
    const days = getWeekDays(1);
    expect(days[0].toISOString().slice(0, 10)).toBe('2026-07-13');
  });
});

describe('formatDateYYYYMMDD', () => {
  it('formato correcto con mes/día de un dígito', () => {
    const d = new Date(2026, 0, 5); // 5 enero 2026
    expect(formatDateYYYYMMDD(d)).toBe('2026-01-05');
  });

  it('formato correcto con mes/día de dos dígitos', () => {
    const d = new Date(2026, 11, 25); // 25 diciembre 2026
    expect(formatDateYYYYMMDD(d)).toBe('2026-12-25');
  });

  it('formato 2026-07-09', () => {
    const d = new Date(2026, 6, 9);
    expect(formatDateYYYYMMDD(d)).toBe('2026-07-09');
  });
});

describe('isPastDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fecha futura retorna false', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T12:00:00'));
    expect(isPastDate('2026-07-10', 8)).toBe(false);
  });

  it('fecha pasada retorna true', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T15:00:00'));
    expect(isPastDate('2026-07-09', 8)).toBe(true);
  });

  it('fecha de hoy con hora futura retorna false', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T10:00:00'));
    expect(isPastDate('2026-07-09', 12)).toBe(false);
  });

  it('fecha de hoy con hora pasada retorna true', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T15:00:00'));
    expect(isPastDate('2026-07-09', 12)).toBe(true);
  });
});
