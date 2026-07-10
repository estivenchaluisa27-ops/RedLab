import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeAttr } from '../../src/utils/escape.js';

describe('escapeHtml', () => {
  it('escapa ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapa < y >', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('escapa comillas dobles', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapa comillas simples', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('retorna string vacío para null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('convierte números a string', () => {
    expect(escapeHtml(123)).toBe('123');
  });

  it('escapa <script> XSS', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('maneja strings normales sin cambios', () => {
    expect(escapeHtml('hola mundo')).toBe('hola mundo');
  });

  it('escapa objeto a string', () => {
    expect(escapeHtml({ toString: () => 'obj' })).toBe('obj');
  });
});

describe('escapeAttr', () => {
  it('escapa comillas dobles', () => {
    expect(escapeAttr('a"b')).toBe('a&quot;b');
  });

  it('escapa backticks', () => {
    expect(escapeAttr('a`b')).toBe('a&#96;b');
  });

  it('escapa signos de dólar (template literals)', () => {
    expect(escapeAttr('a$b')).toBe('a&#36;b');
  });

  it('escapa < y >', () => {
    expect(escapeAttr('<img>')).toBe('&lt;img&gt;');
  });

  it('retorna string vacío para null', () => {
    expect(escapeAttr(null)).toBe('');
  });

  it('escapa todos los caracteres peligrosos juntos', () => {
    expect(escapeAttr('<script>`$"&\'</script>')).toBe(
      '&lt;script&gt;&#96;&#36;&quot;&amp;&#39;&lt;/script&gt;'
    );
  });
});
