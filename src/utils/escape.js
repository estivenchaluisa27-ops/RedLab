/**
 * src/utils/escape.js — Utilidades de escaping para XSS safety
 */

/**
 * Escapa caracteres peligrosos para contenido HTML seguro.
 * @param {*} str - Input a escapar (null/undefined → '')
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapa caracteres peligrosos para atributos HTML (incluye backticks y template literals).
 * @param {*} str - Input a escapar (null/undefined → '')
 * @returns {string}
 */
export function escapeAttr(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;')
    .replace(/\$/g, '&#36;');
}
