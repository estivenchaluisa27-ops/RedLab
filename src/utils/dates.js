/**
 * src/utils/dates.js — Utilidades de fechas para el calendario semanal
 */
import { DEFAULTS } from '../settings/lab-config.js';

/**
 * Devuelve un array de fechas para una semana dada, una por cada día
 * listado en `weekDays`.
 * Sin segundo argumento conserva la semántica móvil: 5 fechas (lun–vie).
 * @param {number} offset - Semanas relativas a la actual (0 = esta semana)
 * @param {number[]} [weekDays] - Días a incluir (0=dom … 6=sáb); default lun–vie
 * @returns {Date[]}
 */
export function getWeekDays(offset = 0, weekDays = DEFAULTS.weekDays) {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  now.setDate(now.getDate() + (offset * 7));
  const d = (now.getDay() === 0) ? -6 : 1 - now.getDay();
  const mon = new Date(now);
  mon.setDate(mon.getDate() + d);
  const w = [];
  for (const dayOfWeek of weekDays) {
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const x = new Date(mon);
    x.setDate(x.getDate() + diff);
    w.push(x);
  }
  return w;
}

/**
 * Limita un índice de día al rango L–V (0-4).
 * Acepta números, strings numéricos y truncados; cualquier otro valor cae a 0.
 * @param {*} i
 * @returns {number}
 */
export function clampDayIndex(i) {
  const n = Number(i);
  if (!Number.isFinite(n)) return 0;
  return Math.min(4, Math.max(0, Math.trunc(n)));
}

/**
 * Calcula el aterrizaje al salir por un borde de la tira L–V.
 * Solo hay salto de semana en los bordes con dirección hacia afuera:
 * viernes + adelante => semana siguiente, lunes; lunes + atrás => semana
 * anterior, viernes. Cualquier otro caso no cambia de semana.
 * @param {number} dayIndex - Índice actual 0-4
 * @param {number} direction - +1 (adelante) o -1 (atrás)
 * @returns {{ weekDelta: number, landingIndex: number }}
 */
export function nextWeekLanding(dayIndex, direction) {
  const idx = clampDayIndex(dayIndex);
  if (idx === 4 && direction > 0) return { weekDelta: 1, landingIndex: 0 };
  if (idx === 0 && direction < 0) return { weekDelta: -1, landingIndex: 4 };
  return { weekDelta: 0, landingIndex: idx };
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
