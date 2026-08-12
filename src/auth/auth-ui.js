/**
 * src/auth/auth-ui.js — UI de login, logout, reset/change password
 */
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail, updatePassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { showMessage, alert as notifyAlert } from '../utils/notify.js';

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

  const email = document.getElementById('login-email').value;
  const remember = document.getElementById('remember-me')?.checked;
  if (remember) {
    localStorage.setItem('redlab_remember_email', email.trim().toLowerCase());
  } else {
    localStorage.removeItem('redlab_remember_email');
  }

  try {
    await signInWithEmailAndPassword(auth, email, document.getElementById('login-password').value);
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
    notifyAlert("Enlace enviado.");
    closeResetModal();
  } catch {
    notifyAlert("Error al enviar.");
  }
}

// --- Signup Modal (auto-registro de jefes de grupo) ---
const UCE_EMAIL_REGEX = /^[a-zA-Z0-9._-]+@uce\.edu\.ec$/;

export function openSignupModal() {
  document.getElementById('signup-modal').classList.remove('hidden');
}

export function closeSignupModal() {
  document.getElementById('signup-modal').classList.add('hidden');
}

export async function handleSignup(e, auth) {
  e.preventDefault();
  const email = document.getElementById('signup-email').value.trim().toLowerCase();
  const p1 = document.getElementById('signup-password').value;
  const p2 = document.getElementById('signup-confirm').value;

  if (!UCE_EMAIL_REGEX.test(email)) {
    return notifyAlert("Debe usar un correo institucional @uce.edu.ec.");
  }
  if (p1.length < 6) {
    return notifyAlert("Contraseña mínimo 6 caracteres.");
  }
  if (p1 !== p2) {
    return notifyAlert("Las contraseñas no coinciden.");
  }

  try {
    await createUserWithEmailAndPassword(auth, email, p1);
    notifyAlert("Cuenta creada. Ya puedes ingresar.");
    closeSignupModal();
    document.getElementById('signup-form').reset();
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      notifyAlert("Ya existe una cuenta con este correo. Inicia sesión.");
    } else if (error.code === 'auth/weak-password') {
      notifyAlert("Contraseña demasiado débil (mínimo 6 caracteres).");
    } else if (error.code === 'auth/invalid-email') {
      notifyAlert("Correo inválido.");
    } else {
      console.error(error);
      notifyAlert("Error al crear la cuenta. Intenta de nuevo.");
    }
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
  if (p1 !== p2 || p1.length < 6) return notifyAlert("Error en contraseña.");
  try {
    await updatePassword(auth.currentUser, p1);
    notifyAlert("Actualizada.");
    closeChangePasswordModal();
  } catch (e) {
    if (e.code === 'auth/requires-recent-login') {
      notifyAlert("Re-ingrese.");
      await signOut(auth);
    } else notifyAlert("Error.");
  }
}
