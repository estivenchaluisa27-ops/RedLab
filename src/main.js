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
import { initAuthListener as _initAuthListener, setupSession as _setupSession, unsubscribeAuthListener } from './auth/auth.js';
import { handleLogin, handleLogout, togglePassword, openResetModal, closeResetModal, sendResetLink, openChangePasswordModal, closeChangePasswordModal, handleChangePassword } from './auth/auth-ui.js';
import { bindLoginView } from './views/login-view.js';

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

// Auth functions — expuestas como window.* para onclick handlers restantes
window.handleLogout = () => handleLogout(clearListeners, window._auth);
window.togglePassword = togglePassword;
window.openResetModal = openResetModal;
window.closeResetModal = closeResetModal;
window.sendResetLink = (e) => sendResetLink(e, window._auth);
window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.handleChangePassword = (e) => handleChangePassword(e, window._auth);

// Inicializar Firebase
document.addEventListener('DOMContentLoaded', () => {
  const { db, auth } = initFirebase();
  window._db = db;
  window._auth = auth;

  // Bind login view
  bindLoginView(auth);

  // Event delegation para data-action handlers
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'handle-logout') window.handleLogout();
    if (action === 'open-change-password-modal') window.openChangePasswordModal();
    if (action === 'close-change-password-modal') window.closeChangePasswordModal();
  });

  // Bind change password form
  const cpForm = document.getElementById('change-password-form');
  if (cpForm) {
    cpForm.addEventListener('submit', (e) => handleChangePassword(e, auth));
  }

  // Iniciar auth listener
  _initAuthListener(auth, db, state, resetState,
    (role, userData, studentData) => _setupSession(role, userData, studentData, state, db)
  );
});
