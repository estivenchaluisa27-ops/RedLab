/**
 * src/admin-router-controller.js — Une el router con el DOM del admin-dashboard
 *
 * Responsabilidades:
 *   - initAdminRouter(): arranca el router con un handler que (1) toggle de
 *     visibility entre <section data-section="..."> de #admin-section, (2) marca
 *     el item activo del sidebar (#admin-sidebar), (3) dispara la animación
 *     GSAP de entrada sobre la sección mostrada, (4) invoca hooks de
 *     setup específicos por sección (ej: setupAdminCalendarLogic para calendario).
 *
 * No conoce Firebase ni state; solo DOM + router + callbacks de setup que
 * main.js le inyecta. Mantiene la surface mínima y testeable.
 */
import { initRouter, navigate } from './router.js';
import { animateViewIn } from './utils/motion.js';

let _sectionSetup = {};
let _currentSection = null;

/**
 * Registra el callback que se ejecuta cuando una sección se vuelve activa.
 * Sólo se llama la primera vez que la sección se monta OR si se pasa
 * `options.rerunOnEveryEnter: true` (útil para calendario que necesita
 * re-anclar listeners del calendario al volver a entrar).
 * @param {string} section - 'calendario' | 'cursos' | ...
 * @param {() => void} setupFn
 * @param {{ rerunOnEveryEnter?: boolean }} [options]
 */
export function registerSectionSetup(section, setupFn, options = {}) {
  _sectionSetup[section] = { fn: setupFn, runOnce: !options.rerunOnEveryEnter, hasRun: false };
}

function updateSidebarActive(section) {
  const items = document.querySelectorAll('#admin-sidebar .sidebar-item');
  items.forEach(item => {
    const isActive = item.dataset.route === section;
    item.classList.toggle('bg-uce-700', isActive);
    item.classList.toggle('text-white', isActive);
    item.classList.toggle('shadow-md', isActive);
    item.classList.toggle('font-bold', isActive);
    if (isActive) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
}

function showSection(section) {
  const sections = document.querySelectorAll('#admin-section > section[data-section]');
  let targetEl = null;
  sections.forEach(s => {
    const match = s.dataset.section === section;
    s.classList.toggle('hidden', !match);
    if (match) targetEl = s;
  });

  if (!targetEl) {
    // Fallback: si la sección no existe en el DOM, mostrar calendario (default).
    const fallback = document.querySelector('#admin-section > section[data-section="calendario"]');
    if (fallback) fallback.classList.remove('hidden');
    section = 'calendario';
    targetEl = fallback;
  }

  updateSidebarActive(section);

  // Animación de entrada (GSAP con degradación graceful si no está cargado).
  animateViewIn(targetEl);

  // Hook de setup de la sección (run-once por defecto, configurable).
  const setup = _sectionSetup[section];
  if (setup) {
    if (!setup.runOnce || !setup.hasRun) {
      try { setup.fn(); } catch (e) { console.error(`setup section "${section}" failed`, e); }
      setup.hasRun = true;
    }
  }

  _currentSection = section;
  targetEl.dispatchEvent(new CustomEvent('admin:section-enter', { detail: { section }, bubbles: true }));
}

/**
 * Inicializa el router del admin. Idempotente.
 */
export function initAdminRouter() {
  initRouter((route) => {
    showSection(route.section);
  });
}

/**
 * Navega a una sección del admin.
 * @param {string} section - 'calendario' | 'cursos' | 'reportes' | 'ajustes'
 */
export function goAdminSection(section) {
  navigate(`#/admin/${section}`);
}

/**
 * Sección actualmente activa (string o null si el router no ha arrancado).
 */
export function activeSection() {
  return _currentSection;
}
