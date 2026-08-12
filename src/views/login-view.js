/**
 * src/views/login-view.js — Bind de eventos del formulario de login
 */
import { handleLogin, togglePassword, openResetModal, closeResetModal, openSignupModal, closeSignupModal } from '../auth/auth-ui.js';

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

  // Reset password
  const resetBtn = document.querySelector('[data-action="open-reset-modal"]');
  if (resetBtn) {
    resetBtn.addEventListener('click', openResetModal);
  }

  const resetCancelBtn = document.querySelector('[data-action="close-reset-modal"]');
  if (resetCancelBtn) {
    resetCancelBtn.addEventListener('click', closeResetModal);
  }

  // Signup modal
  const signupBtn = document.querySelector('[data-action="open-signup-modal"]');
  if (signupBtn) {
    signupBtn.addEventListener('click', openSignupModal);
  }

  const signupCancelBtn = document.querySelector('[data-action="close-signup-modal"]');
  if (signupCancelBtn) {
    signupCancelBtn.addEventListener('click', closeSignupModal);
  }


}
