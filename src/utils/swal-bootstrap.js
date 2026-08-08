/**
 * src/utils/swal-bootstrap.js — Puente temporal para SweetAlert2 global
 * Durante la migración, muchas funciones usan Swal como global.
 * Este módulo importa Swal desde CDN y lo expone en window.
 */

// SweetAlert2 se carga como CDN global (<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11.26.25/dist/sweetalert2.all.min.js">).
// Este módulo simplemente asegura que está disponible como window.Swal.
// Cuando se migre completamente a npm, se cambiará a importación directa.

export function ensureSwal() {
  if (typeof Swal === 'undefined') {
    console.warn('SweetAlert2 no está cargado. Asegúrate de incluir el CDN.');
  }
  return typeof Swal !== 'undefined' ? Swal : null;
}
