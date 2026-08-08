/**
 * src/utils/notify.js — Notificaciones (alert wrapper + showMessage)
 */
import { ensureSwal } from './swal-bootstrap.js';

/**
 * Muestra un mensaje con SweetAlert2, con fallback al alert nativo.
 */
export function alert(message) {
  const Swal = ensureSwal();
  if (!Swal) {
    window.alert(message);
    return;
  }
  const isError = message.toLowerCase().includes("error") ||
                   message.toLowerCase().includes("lleno") ||
                   message.toLowerCase().includes("bloqueado");
  Swal.fire({
    text: message,
    icon: isError ? 'error' : 'info',
    confirmButtonColor: '#004274',
    confirmButtonText: 'Aceptar',
    customClass: {
      popup: 'rounded-xl shadow-2xl border-t-4 border-[#004274]'
    }
  });
}

/**
 * Pide confirmación con SweetAlert2, con fallback a confirm() nativo.
 * @param {string} message
 * @returns {Promise<boolean>} true si el usuario confirmó
 */
export async function notifyConfirm(message) {
  const Swal = ensureSwal();
  if (!Swal) return window.confirm(message);
  const result = await Swal.fire({
    title: '¿Estás seguro?',
    text: message,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Sí, continuar',
    cancelButtonText: 'Cancelar',
    customClass: {
      popup: 'rounded-xl shadow-2xl border-t-4 border-[#004274]'
    }
  });
  return result.isConfirmed === true;
}

/**
 * Muestra un mensaje en el DOM o usa alert como fallback.
 * @param {'success'|'error'|'info'} type
 * @param {string} text
 */
export function showMessage(type, text) {
  const m = document.getElementById('message-box');
  if (m) {
    m.innerHTML = text;
    m.classList.remove('hidden');
  } else {
    alert(text);
  }
}
