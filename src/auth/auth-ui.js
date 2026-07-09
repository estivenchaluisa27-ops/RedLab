/**
 * src/auth/auth-ui.js — UI de login, logout, reset/change password
 */
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail, updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { showMessage } from '../utils/notify.js';

/**
 * Maneja el login con email/password.
 * @param {Event} e
 * @param {FirebaseAuth} auth
 */
export async function handleLogin(e, auth) {
  e.preventDefault();
  const btn = document.getElementById('login-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>VALIDANDO...';

  try {
    await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value);
  } catch {
    btn.disabled = false;
    btn.innerHTML = 'INGRESAR';
    showMessage('error', 'Credenciales incorrectas.');
  }
}

/**
 * Cierra la sesión y recarga la página.
 * @param {Function} clearListeners
 * @param {FirebaseAuth} auth
 */
export async function handleLogout(clearListeners, auth) {
  clearListeners();
  await signOut(auth);
  window.location.reload();
}

/**
 * Alterna visibilidad de contraseña.
 * @param {string} inputId
 * @param {HTMLElement} icon
 */
export function togglePassword(inputId, icon) {
  const inpt = document.getElementById(inputId);
  if (inpt.type === "password") {
    inpt.type = "text";
    icon.classList.replace("fa-eye", "fa-eye-slash");
  } else {
    inpt.type = "password";
    icon.classList.replace("fa-eye-slash", "fa-eye");
  }
}

// --- Reset Password Modal ---
export function openResetModal() {
  document.getElementById('reset-modal').classList.remove('hidden');
}

export function closeResetModal() {
  document.getElementById('reset-modal').classList.add('hidden');
}

export async function sendResetLink(e, auth) {
  e.preventDefault();
  try {
    await sendPasswordResetEmail(auth, document.getElementById('reset-email').value);
    alert("Enlace enviado.");
    closeResetModal();
  } catch {
    alert("Error al enviar.");
  }
}

// --- Change Password Modal ---
export function openChangePasswordModal() {
  document.getElementById('change-password-modal').classList.remove('hidden');
}

export function closeChangePasswordModal() {
  document.getElementById('change-password-modal').classList.add('hidden');
}

export async function handleChangePassword(e, auth) {
  e.preventDefault();
  const p1 = document.getElementById('new-password').value;
  const p2 = document.getElementById('confirm-password').value;
  if (p1 !== p2 || p1.length < 6) return alert("Error en contraseña.");
  try {
    await updatePassword(auth.currentUser, p1);
    alert("Actualizada.");
    closeChangePasswordModal();
  } catch (e) {
    if (e.code === 'auth/requires-recent-login') {
      alert("Re-ingrese.");
      await signOut(auth);
    } else alert("Error.");
  }
}
