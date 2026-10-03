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
 *
 * @param {'student'|'admin'|'login'} name
 */
export function showView(name) {
  const studentView = document.getElementById('student-dashboard');
  const adminView = document.getElementById('admin-dashboard');
  const loginView = document.getElementById('login-view');

  const target = name === 'admin' ? adminView : name === 'student' ? studentView : loginView;

  // Estado ANTES de alternar. Si la vista ya estaba visible no hay entrada que
  // animar: el login es la vista de arranque (visible desde el primer frame), y
  // al resolver la sesion showView('login') lo volveria a animar, con lo que
  // parpadea fuera y vuelve a entrar aunque no haya cambiado nada.
  const wasHidden = target ? target.classList.contains('hidden') : false;

  if (loginView) loginView.classList.toggle('hidden', name !== 'login');
  if (studentView) studentView.classList.toggle('hidden', name !== 'student');
  if (adminView) adminView.classList.toggle('hidden', name !== 'admin');

  if (wasHidden) animateViewIn(target);
}
