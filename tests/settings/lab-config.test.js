import { describe, it, expect } from 'vitest';
import {
  DEFAULTS,
  mergeLabConfig,
  validateLabConfig,
  loadLabConfig,
} from '../../src/settings/lab-config.js';

describe('lab-config defaults', () => {
  it('refleja los valores hardcodeados verificados', () => {
    expect(DEFAULTS).toEqual({
      slotCapacity: 4,
      startHour: 7,
      endHour: 19,
      weekDays: [1, 2, 3, 4, 5],
      weeklyLimit: 4,
      allowedEmailDomain: 'uce.edu.ec',
    });
  });
});

describe('mergeLabConfig', () => {
  it('devuelve copia de defaults ante remoto ausente o inválido', () => {
    for (const remote of [null, undefined, 42, 'x', [1, 2]]) {
      const merged = mergeLabConfig(DEFAULTS, remote);
      expect(merged).toEqual(DEFAULTS);
      expect(merged).not.toBe(DEFAULTS);
    }
  });

  it('aplica claves conocidas e ignora desconocidas y undefined', () => {
    const merged = mergeLabConfig(DEFAULTS, {
      slotCapacity: 6,
      weeklyLimit: undefined,
      inventado: true,
    });
    expect(merged.slotCapacity).toBe(6);
    expect(merged.weeklyLimit).toBe(4);
    expect(merged).not.toHaveProperty('inventado');
  });
});

describe('validateLabConfig', () => {
  it('acepta DEFAULTS', () => {
    const { valid, errors } = validateLabConfig({ ...DEFAULTS });
    expect(valid).toBe(true);
    expect(errors).toEqual([]);
  });

  it('rechaza capacidad <= 0', () => {
    for (const slotCapacity of [0, -2]) {
      const { valid, errors } = validateLabConfig({ ...DEFAULTS, slotCapacity });
      expect(valid).toBe(false);
      expect(errors.join(' ')).toMatch(/slotCapacity/);
    }
  });

  it('rechaza fin <= inicio', () => {
    const { valid, errors } = validateLabConfig({ ...DEFAULTS, startHour: 10, endHour: 10 });
    expect(valid).toBe(false);
    expect(errors.join(' ')).toMatch(/endHour/);
  });

  it('rechaza dominio sin regex válida', () => {
    for (const allowedEmailDomain of ['', 'sin-dominio', 'con espacios.com']) {
      const { valid, errors } = validateLabConfig({ ...DEFAULTS, allowedEmailDomain });
      expect(valid).toBe(false);
      expect(errors.join(' ')).toMatch(/allowedEmailDomain/);
    }
  });
});

describe('loadLabConfig', () => {
  const fakeDoc = (db) => ({ db });

  it('devuelve defaults ante error de lectura (nunca null)', async () => {
    const cfg = await loadLabConfig(
      {},
      { docFn: fakeDoc, getDocFn: async () => { throw new Error('sin red'); } },
    );
    expect(cfg).toEqual(DEFAULTS);
    expect(cfg).not.toBeNull();
  });

  it('devuelve defaults si el doc no existe', async () => {
    const cfg = await loadLabConfig(
      {},
      { docFn: fakeDoc, getDocFn: async () => ({ exists: () => false }) },
    );
    expect(cfg).toEqual(DEFAULTS);
  });

  it('mezcla un doc remoto válido', async () => {
    const cfg = await loadLabConfig(
      {},
      {
        docFn: fakeDoc,
        getDocFn: async () => ({ exists: () => true, data: () => ({ slotCapacity: 6 }) }),
      },
    );
    expect(cfg.slotCapacity).toBe(6);
    expect(cfg.weeklyLimit).toBe(DEFAULTS.weeklyLimit);
  });

  it('devuelve defaults si el doc remoto es inválido', async () => {
    const cfg = await loadLabConfig(
      {},
      {
        docFn: fakeDoc,
        getDocFn: async () => ({ exists: () => true, data: () => ({ slotCapacity: 0 }) }),
      },
    );
    expect(cfg).toEqual(DEFAULTS);
  });
});
