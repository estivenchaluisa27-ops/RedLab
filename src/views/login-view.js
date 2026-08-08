/**
 * src/views/login-view.js — Bind de eventos del formulario de login
 */
import { handleLogin, togglePassword, openResetModal, closeResetModal } from '../auth/auth-ui.js';

/**
 * Registra event listeners del login view.
 * @param {FirebaseAuth} auth
 */
export function bindLoginView(auth) {
  // Form submit
  const form = document.getElementById('login-form');
  if (form) {
    form.addEventListener('submit', (e) => handleLogin(e, auth));
  }

  // Toggle password
  const toggleBtn = document.querySelector('.toggle-password');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => togglePassword('login-password', toggleBtn));
  }

  // Reset password
  const resetBtn = document.querySelector('[data-action="open-reset-modal"]');
  if (resetBtn) {
    resetBtn.addEventListener('click', openResetModal);
  }

  const resetCancelBtn = document.querySelector('[data-action="close-reset-modal"]');
  if (resetCancelBtn) {
    resetCancelBtn.addEventListener('click', closeResetModal);
  }


}
