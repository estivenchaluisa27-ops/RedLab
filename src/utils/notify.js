/**
 * src/utils/notify.js — Notificaciones (alert wrapper + showMessage)
 */
import { ensureSwal } from './swal-bootstrap.js';

/**
 * Reemplaza alert() nativo con SweetAlert2.
 * Se asigna a window.alert en main.js.
 */
export function alert(message) {
  const Swal = ensureSwal();
  if (!Swal) {
    window._nativeAlert(message);
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
