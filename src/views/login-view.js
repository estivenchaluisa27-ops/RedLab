/**
 * src/views/login-view.js — Bind de eventos del formulario de login
 */
import { handleLogin, togglePassword } from '../auth/auth-ui.js';

const REMEMBER_EMAIL_KEY = 'redlab_remember_email';

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

  // Remember-me: precarga el email persistido si existe
  const rememberCheck = document.getElementById('remember-me');
  const emailInput = document.getElementById('login-email');
  if (rememberCheck && emailInput) {
    const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
    if (saved) {
      emailInput.value = saved;
      rememberCheck.checked = true;
    }
  }

  // Toggle password
  const toggleBtn = document.querySelector('.toggle-password');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => togglePassword('login-password', toggleBtn));
  }

  // Nota: los botones open-reset-modal, close-reset-modal, open-signup-modal y
  // close-signup-modal se manejan por el dispatcher global de data-action en main.js.
  // No se registran listeners adicionales aquí para evitar doble despacho.

}
