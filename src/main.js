/**
 * src/main.js — Punto de entrada de la aplicación
 * Inicializa infraestructura y expone utilidades como globals.
 * El script inline restante en index.html usa estas globals.
 */
import { initFirebase, RESERVATIONS_COLLECTION } from './firebase-config.js';
import { state, resetState, clearListeners, setUnsubscribers } from './state.js';
import { alert as notifyAlert } from './utils/notify.js';
import { showView, el, showHide, toggleHidden } from './utils/dom.js';
import { escapeHtml, escapeAttr } from './utils/escape.js';
import { getWeekDays, formatDateYYYYMMDD, isPastDate } from './utils/dates.js';
import { buildCourseId } from './courses/course-utils.js';

// Guardar nativeAlert para fallback
window._nativeAlert = window.alert;

// Sobrescribir alert() nativo por SweetAlert2
window.alert = notifyAlert;

// Exponer utilidades que el script inline restante necesita
window.escapeHtml = escapeHtml;
window.escapeAttr = escapeAttr;
window.getWeekDays = getWeekDays;
window.formatDateYYYYMMDD = formatDateYYYYMMDD;
window.isPastDate = isPastDate;
window.buildCourseId = buildCourseId;
window.showView = showView;
window.el = el;
window.showHide = showHide;
window.toggleHidden = toggleHidden;
window.RESERVATIONS_COLLECTION = RESERVATIONS_COLLECTION;

// State management
window._appState = state;
window._resetState = resetState;
window._clearListeners = clearListeners;
window._setUnsubscribers = setUnsubscribers;

// Inicializar Firebase
document.addEventListener('DOMContentLoaded', () => {
  const { db, auth } = initFirebase();
  window._db = db;
  window._auth = auth;

  // Llamar al initAuthListener original (permanece en index.html)
  if (typeof window._initAuthListener === 'function') {
    window._initAuthListener();
  }
});
