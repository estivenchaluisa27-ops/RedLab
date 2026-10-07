import { describe, it, expect } from 'vitest';
import { coverPattern, coverSeedOf } from '../../src/utils/cover-pattern.js';

describe('coverPattern', () => {
  it('devuelve un data URI con el prefijo correcto', () => {
    const out = coverPattern('curso-abc');
    expect(out.startsWith("url('data:image/svg+xml,")).toBe(true);
    expect(out.endsWith("')")).toBe(true);
  });

  it('usa comillas simples: se inyecta en un atributo HTML con comillas dobles', () => {
    // Si el envoltorio fuera de comillas dobles, cerraria el atributo style y
    // la portada quedaria vacia. Medido: el atributo llegaba truncado a url(".
    const out = coverPattern('curso-abc');
    expect(out).not.toContain('"');
    // Y el payload no puede contener apostrophes que reabran el envoltorio.
    expect(out.slice(5, -2)).not.toContain("'");
  });

  it('sobrevive a la inyeccion real en un atributo style', () => {
    const out = coverPattern('curso-abc');
    const div = document.createElement('div');
    div.setAttribute('style', `background-image:${out}`);
    // El atributo debe sobrevivir entero, no truncarse en el primer delimitador.
    expect(div.getAttribute('style')).toBe(`background-image:${out}`);
    expect(div.style.backgroundImage).not.toBe('');
    expect(div.style.backgroundImage).toContain('data:image/svg+xml');
  });

  it('es determinista: misma semilla, misma portada', () => {
    expect(coverPattern('curso-abc')).toBe(coverPattern('curso-abc'));
  });

  it('semillas distintas producen portadas distintas', () => {
    const a = coverPattern('curso-abc');
    const b = coverPattern('curso-xyz');
    expect(a).not.toBe(b);
  });

  it('codifica los colores del marcador de posicion (#)', () => {
    // Un %23 sin escapar rompe el data URI y la portada queda vacia.
    const out = coverPattern('curso-abc');
    expect(out).not.toContain('#');
    expect(out).toContain('%23');
  });

  it('tolera semillas vacias, nulas e indefinidas', () => {
    expect(() => coverPattern('')).not.toThrow();
    expect(() => coverPattern(null)).not.toThrow();
    expect(() => coverPattern(undefined)).not.toThrow();
    expect(coverPattern(null)).toBe(coverPattern(undefined));
  });

  it('el SVG decodificado es valido y tiene fondo y figuras', () => {
    const inner = decodeURIComponent(coverPattern('curso-abc').slice("url('data:image/svg+xml,".length, -2));
    expect(inner.startsWith('<svg')).toBe(true);
    expect(inner.endsWith('</svg>')).toBe(true);
    expect(inner).toMatch(/<rect [^>]*fill="(#[0-9a-fA-F]{6}|url\([^)]+\))"/);
    // Al menos una figura dibujada encima del fondo.
    expect(inner).toMatch(/<(polygon|rect|circle)/);
  });

  it('no usa apostrophes sin escapar dentro del data URI', () => {
    // Solo el payload: el envoltorio url('...') si lleva apostrophes a proposito.
    const payload = coverPattern("curso-con-apostrophe").slice(5, -2);
    expect(payload).not.toContain("'");
    expect(payload).not.toContain('%27%27');
  });
});

describe('coverSeedOf', () => {
  it('produce enteros sin signo de 32 bits', () => {
    for (const s of ['a', 'curso-abc', '', 'x'.repeat(200)]) {
      const h = coverSeedOf(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(4294967295);
    }
  });

  it(' reparte las claves cortas en todo el rango (sin agrupamientos)', () => {
    const buckets = new Set();
    for (let i = 0; i < 200; i += 1) buckets.add(Math.floor((coverSeedOf(`curso-${i}`) / 4294967296) * 16));
    // Si el hash fuera Poor, casi todos caerian en pocos cubos.
    expect(buckets.size).toBeGreaterThanOrEqual(12);
  });
});

describe('coverPattern adjacencia de paletas', () => {
  const bg1Of = (out) => {
    const m = decodeURIComponent(out.slice("url('data:image/svg+xml,".length, -2)).match(/stop-color="(#[0-9a-fA-F]{6})"/);
    return m ? m[1] : null;
  };

  it('tarjetas vecinas nunca repiten paleta', () => {
    for (let i = 0; i < 13; i += 1) {
      expect(bg1Of(coverPattern('x', i))).not.toBe(bg1Of(coverPattern('x', i + 1)));
    }
  });
});
