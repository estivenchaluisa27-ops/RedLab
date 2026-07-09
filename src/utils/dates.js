/**
 * src/utils/dates.js — Utilidades de fechas para el calendario semanal
 */

/**
 * Devuelve un array de 5 fechas (lun-vie) para una semana dada.
 * @param {number} offset - Semanas relativas a la actual (0 = esta semana)
 * @returns {Date[]}
 */
export function getWeekDays(offset = 0) {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  now.setDate(now.getDate() + (offset * 7));
  const d = (now.getDay() === 0) ? -6 : 1 - now.getDay();
  const mon = new Date(now);
  mon.setDate(mon.getDate() + d);
  const w = [];
  for (let i = 0; i < 5; i++) {
    const x = new Date(mon);
    x.setDate(x.getDate() + i);
    w.push(x);
  }
  return w;
}

/**
 * Formatea una fecha como YYYY-MM-DD.
 * @param {Date} d
 * @returns {string}
 */
export function formatDateYYYYMMDD(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Determina si una fecha+hora ya pasó.
 * @param {string} dStr - Fecha en formato YYYY-MM-DD
 * @param {number} h - Hora del slot (0-23)
 * @returns {boolean}
 */
export function isPastDate(dStr, h) {
  const now = new Date();
  const [y, m, d] = dStr.split('-').map(Number);
  const slot = new Date(y, m - 1, d, h + 1);
  return slot < now;
}
