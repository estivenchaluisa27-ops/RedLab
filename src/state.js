/**
 * src/state.js — Estado global de la aplicación
 */

/**
 * Día activo de la vista-día móvil del estudiante (índice 0-4 = lun-vie).
 * Por defecto hoy si es L–V, si no lunes (0). Solo lo usa el módulo
 * src/calendar/student-day-view.js; el resto del calendario no lo lee.
 * @param {Date} [now]
 * @returns {number}
 */
export function defaultActiveDayIndex(now = new Date()) {
  const d = now.getDay();
  return d >= 1 && d <= 5 ? d - 1 : 0;
}

export let state = {
  user: null,
  role: null,
  courseId: null,
  groupId: null,
  groupName: null,
  currentViewCourse: null,
  weekOffset: 0,
  activeDayIndex: defaultActiveDayIndex(),
  selectedSlots: [],
  coursesCache: {},
  professorsCache: {},
  weeklyLimit: 4
};

export function resetState() {
  Object.assign(state, {
    user: null,
    role: null,
    courseId: null,
    groupId: null,
    groupName: null,
    currentViewCourse: null,
    weekOffset: 0,
    activeDayIndex: defaultActiveDayIndex(),
    selectedSlots: [],
    coursesCache: {},
    professorsCache: {},
    weeklyLimit: 4
  });
}

/**
 * Registro central de listeners Firestore.
 * Cada módulo registra su función unsubscribe con un nombre único;
 * el logout limpia todo con una sola llamada a clearAllListeners().
 * Los wrappers por módulo (clearCalendarListeners, clearCoursesListener,
 * clearGroupsListener, stopNotificationsListener, unsubscribeAuthListener)
 * se mantienen como atajos que delegan en este registro.
 */
const listenerRegistry = new Map();

/**
 * Registra un unsubscribe bajo un nombre. Si ya existía uno previo con el
 * mismo nombre, se invoca antes de reemplazarlo (evita listeners zombie
 * al re-suscribir, p. ej. al cambiar de semana en el calendario).
 * @param {string} name
 * @param {Function|null|undefined} unsubscribe
 */
export function registerListener(name, unsubscribe) {
  if (typeof name !== 'string' || !name) return;
  const prev = listenerRegistry.get(name);
  if (typeof prev === 'function') {
    try { prev(); } catch (_) { /* noop: cleanup previo falló, igual se reemplaza */ }
  }
  if (typeof unsubscribe === 'function') {
    listenerRegistry.set(name, unsubscribe);
  } else {
    listenerRegistry.delete(name);
  }
}

/**
 * Indica si hay un listener registrado bajo ese nombre.
 * @param {string} name
 */
export function hasListener(name) {
  return listenerRegistry.has(name);
}

/**
 * Invoca y elimina el listener registrado bajo ese nombre (no-op si no existe).
 * @param {string} name
 */
export function unregisterListener(name) {
  const fn = listenerRegistry.get(name);
  listenerRegistry.delete(name);
  if (typeof fn === 'function') {
    try { fn(); } catch (_) { /* noop: unsubscribe falló, el registro ya quedó limpio */ }
  }
}

/**
 * Invoca y elimina todos los listeners registrados (logout).
 */
export function clearAllListeners() {
  for (const [name, fn] of Array.from(listenerRegistry.entries())) {
    listenerRegistry.delete(name);
    try { if (typeof fn === 'function') fn(); } catch (_) { /* noop: sigue con el resto */ }
  }
}
