/**
 * tests/state.test.js — registro central de listeners (F3)
 *
 * Este registro es de lo que depende todo el camino de logout, y hasta F3 no
 * tenía ninguna cobertura: los 96 tests previos no ejercitaban ni un
 * registerListener. Estos casos fijan los invariantes que el resto del código
 * asume.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerListener,
  unregisterListener,
  hasListener,
  clearAllListeners,
} from '../src/state.js';

// state.js es un módulo singleton: el registro persiste entre tests.
beforeEach(() => {
  clearAllListeners();
});

describe('registerListener', () => {
  it('invoca el unsubscribe previo al reemplazar con el mismo nombre', () => {
    const prev = vi.fn();
    const next = vi.fn();
    registerListener('calendar:reservations', prev);
    registerListener('calendar:reservations', next);

    expect(prev).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    expect(hasListener('calendar:reservations')).toBe(true);
  });

  it('mantiene invariantes independientes por nombre', () => {
    const a = vi.fn();
    const b = vi.fn();
    registerListener('groups:list', a);
    registerListener('courses:list', b);

    unregisterListener('groups:list');

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(hasListener('groups:list')).toBe(false);
    expect(hasListener('courses:list')).toBe(true);
  });

  it('ignora nombres inválidos', () => {
    registerListener('', vi.fn());
    registerListener(null, vi.fn());
    expect(hasListener('')).toBe(false);
    expect(hasListener(null)).toBe(false);
  });

  it('elimina la clave si el unsubscribe no es función', () => {
    registerListener('notifications:list', vi.fn());
    registerListener('notifications:list', undefined);

    expect(hasListener('notifications:list')).toBe(false);
  });

  it('un unsubscribe que lanza no impide reemplazar el siguiente', () => {
    const boom = vi.fn(() => { throw new Error('cleanup falló'); });
    registerListener('auth:state', boom);
    expect(() => registerListener('auth:state', vi.fn())).not.toThrow();
    expect(boom).toHaveBeenCalledTimes(1);
  });
});

describe('unregisterListener', () => {
  it('invoca una sola vez y la segunda llamada es no-op', () => {
    const un = vi.fn();
    registerListener('calendar:pending', un);

    unregisterListener('calendar:pending');
    unregisterListener('calendar:pending');

    expect(un).toHaveBeenCalledTimes(1);
    expect(hasListener('calendar:pending')).toBe(false);
  });
});

describe('clearAllListeners', () => {
  it('vacía todas las claves y no sobrevive ningún unsubscribe vivo', () => {
    // Las 8 claves que registra la app en producción.
    const names = [
      'auth:state',
      'notifications:list',
      'calendar:reservations',
      'calendar:pending',
      'calendar:student-blocked',
      'calendar:student-course',
      'groups:list',
      'courses:list',
    ];
    const unsubs = names.map(() => vi.fn());
    names.forEach((name, i) => registerListener(name, unsubs[i]));

    clearAllListeners();

    unsubs.forEach((un) => expect(un).toHaveBeenCalledTimes(1));
    names.forEach((name) => expect(hasListener(name)).toBe(false));
  });

  it('permite re-suscribir tras el logout (no queda espejo atascado)', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerListener('notifications:list', first);

    clearAllListeners();
    // La guarda de startNotificationsListener ya no debe bloquearse por un
    // unsubscribe local no-null: el registro es la única fuente de verdad.
    registerListener('notifications:list', second);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(hasListener('notifications:list')).toBe(true);
  });

  it('un unsubscribe que lanza no impide limpiar el resto', () => {
    const boom = vi.fn(() => { throw new Error('unsubscribe falló'); });
    const other = vi.fn();
    registerListener('auth:state', boom);
    registerListener('groups:list', other);

    expect(() => clearAllListeners()).not.toThrow();
    expect(boom).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);
    expect(hasListener('auth:state')).toBe(false);
    expect(hasListener('groups:list')).toBe(false);
  });
});