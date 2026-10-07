/**
 * src/utils/uce-email.js — Validadores de correo institucional UCE
 *
 * Extraído de src/auth/auth-ui.js (UCE_EMAIL_REGEX + trim().toLowerCase()).
 * Puro, sin dependencias. Ningún consumidor existente se modifica (P4 cableará).
 */

/**
 * Normaliza un correo: recorta espacios y pasa a minúsculas.
 * @param {*} email - Input a normalizar (null/undefined → '')
 * @returns {string}
 */
export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

/**
 * Verifica que un correo pertenezca al dominio institucional.
 * Replica el regex inline de auth-ui.js: /^[a-zA-Z0-9._-]+@uce\.edu\.ec$/
 * Espera el correo ya normalizado (ver normalizeEmail).
 * @param {*} email - Correo a validar
 * @param {string} [domain='uce.edu.ec'] - Dominio institucional
 * @returns {boolean}
 */
export function isUceEmail(email, domain = 'uce.edu.ec') {
  if (typeof email !== 'string') return false;
  const escaped = String(domain).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^[a-zA-Z0-9._-]+@${escaped}$`).test(email);
}
