/**
 * src/utils/dom.js — Utilidades DOM (el, showHide, toggleHidden, showView)
 */
import { animateViewIn } from './motion.js';

/**
 * Abreviatura de document.getElementById
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export function el(id) {
  return document.getElementById(id);
}

/**
 * Oculta todos los IDs y muestra solo el showId.
 * @param {string[]} ids - IDs a ocultar
 * @param {string} showId - ID a mostrar
 */
export function showHide(ids, showId) {
  ids.forEach(id => {
    const elem = document.getElementById(id);
    if (elem) elem.classList.add('hidden');
  });
  const show = document.getElementById(showId);
  if (show) show.classList.remove('hidden');
}

/**
 * Alterna la clase 'hidden' en un elemento.
 * @param {string} id
 */
export function toggleHidden(id) {
  const elem = document.getElementById(id);
  if (elem) elem.classList.toggle('hidden');
}

/**
 * Muestra una vista (student/admin) y oculta la otra.
 * @param {'student'|'admin'} name
 */
export function showView(name) {
  const studentView = document.getElementById('student-dashboard');
  const adminView = document.getElementById('admin-dashboard');
  const loginView = document.getElementById('login-view');
  if (loginView) loginView.classList.toggle('hidden', name !== 'login');
  if (studentView) studentView.classList.toggle('hidden', name !== 'student');
  if (adminView) adminView.classList.toggle('hidden', name !== 'admin');
  if (name === 'admin' && adminView) animateViewIn(adminView);
  if (name === 'student' && studentView) animateViewIn(studentView);
  if (name === 'login' && loginView) animateViewIn(loginView);
}
