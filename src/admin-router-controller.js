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
 * FASE B: también despacha sub-vistas de cursos según params del router:
 *   - {action:'nuevo'}           → sub-view "curso-nuevo"
 *   - {action:'editar',courseId} → sub-view "curso-editar"
 *   - {action:'grupos',courseId} → sub-view "curso-grupos"
 *   - {action:'grupos',courseId,groupId} → sub-view "grupo-detalle"
 * Cada sub-view tiene su propio setup hook (registerSubviewSetup) y un
 * onLeave hook opcional (registerSubviewOnLeave) para limpiar listeners.
 *
 * No conoce Firebase ni state; solo DOM + router + callbacks de setup que
 * main.js le inyecta. Mantiene la surface mínima y testeable.
 */
import { initRouter, navigate } from './router.js';
import { animateViewIn } from './utils/motion.js';

let _sectionSetup = {};
let _subviewSetup = {};   // { 'curso-nuevo': { fn, hasRun }, ... }
let _subviewOnLeave = {}; // { 'curso-nuevo': fn, ... }
let _currentSection = null;
let _currentSubview = null;

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

/**
 * Registra el setup para una sub-vista de cursos. Se invoca cada vez que la
 * sub-vista se vuelve activa (siempre, no run-once, porque las sub-vistas
 * dependen de params que cambian entre navegaciones).
 * @param {string} subview - 'curso-nuevo' | 'curso-editar' | 'curso-grupos' | 'grupo-detalle'
 * @param {(params: object) => void} setupFn — recibe los params del router.
 */
export function registerSubviewSetup(subview, setupFn) {
  _subviewSetup[subview] = { fn: setupFn };
}

/**
 * Registra un callback que se ejecuta al SALIR de una sub-vista.
 * Útil para limpiar listeners (ej: clearGroupsListener al salir de curso-grupos).
 * @param {string} subview
 * @param {() => void} onLeaveFn
 */
export function registerSubviewOnLeave(subview, onLeaveFn) {
  _subviewOnLeave[subview] = onLeaveFn;
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

/**
 * Mapa de params.action → sub-view name.
 */
function resolveSubview(params) {
  if (!params || !params.action) return 'curso-lista';
  switch (params.action) {
    case 'nuevo': return 'curso-nuevo';
    case 'editar': return 'curso-editar';
    case 'grupos': return params.groupId ? 'grupo-detalle' : 'curso-grupos';
    default: return 'curso-lista';
  }
}

/**
 * Sub-view opaca: oculta todas las sub-vistas de cursos excepto la indicada.
 * Las sub-vistas se identifican con data-subview en #admin-section.
 */
function showCursosSubview(subview) {
  const subs = document.querySelectorAll('#admin-section [data-subview]');
  subs.forEach(s => {
    s.classList.toggle('hidden', s.dataset.subview !== subview);
  });
  // Si es curso-lista, mostrar el grid de cursos que está en <section data-section="cursos">.
  // Las sub-vistas son siblings separados del section principal. Se manejan por separado.
  const mainCursosSection = document.querySelector('#admin-section > section[data-section="cursos"]');
  if (mainCursosSection) {
    mainCursosSection.classList.toggle('hidden', subview !== 'curso-lista');
  }
}

function showSection(section, params = {}) {
  // Si venimos de la sección 'cursos' y vamos a otra sección, correr el
  // onLeave de la sub-vista activa (limpia listeners, ej: grupos).
  if (_currentSection === 'cursos' && section !== 'cursos' && _currentSubview && _subviewOnLeave[_currentSubview]) {
    try { _subviewOnLeave[_currentSubview](); } catch (e) { console.error(`onLeave subview "${_currentSubview}" failed`, e); }
    _currentSubview = null;
  }

  const sections = document.querySelectorAll('#admin-section > section[data-section]');
  let targetEl = null;
  sections.forEach(s => {
    if (section === 'cursos' && s.dataset.section === 'cursos') {
      // showCursosSubview decide la visibility de las secciones de cursos.
      return;
    }
    const match = s.dataset.section === section;
    s.classList.toggle('hidden', !match);
    if (match) targetEl = s;
  });

  if (!targetEl && section !== 'cursos' && section !== 'calendario') {
    // Fallback: si la sección no existe en el DOM, mostrar calendario (default).
    const fallback = document.querySelector('#admin-section > section[data-section="calendario"]');
    if (fallback) fallback.classList.remove('hidden');
    section = 'calendario';
    targetEl = fallback;
  }

  updateSidebarActive(section);

  if (section === 'cursos') {
    // Resolver sub-vista de cursos según params y despachar.
    const subview = resolveSubview(params);
    // Si cambiamos de sub-vista, ejecutar onLeave de la anterior.
    if (_currentSubview && _currentSubview !== subview && _subviewOnLeave[_currentSubview]) {
      try { _subviewOnLeave[_currentSubview](); } catch (e) { console.error(`onLeave subview "${_currentSubview}" failed`, e); }
    }
    showCursosSubview(subview);
    _currentSubview = subview;

    // Animar la sub-vista visible.
    const subEl = document.querySelector(`#admin-section [data-subview="${subview}"]`)
      || document.querySelector('#admin-section > section[data-section="cursos"]');
    if (subEl) animateViewIn(subEl);

    // Hook de setup de la sub-vista (se corre SIEMPRE porque params puede cambiar).
    const setup = _subviewSetup[subview];
    if (setup) {
      try { setup.fn(params); } catch (e) { console.error(`setup subview "${subview}" failed`, e); }
    }
  } else {
    // Sección top-level normal: animar target y disparar setup.
    if (targetEl) animateViewIn(targetEl);
    const setup = _sectionSetup[section];
    if (setup) {
      if (!setup.runOnce || !setup.hasRun) {
        try { setup.fn(); } catch (e) { console.error(`setup section "${section}" failed`, e); }
        setup.hasRun = true;
      }
    }
  }

  _currentSection = section;
  const dispatchedEvent = new CustomEvent('admin:section-enter', { detail: { section, params }, bubbles: true });
  if (targetEl) targetEl.dispatchEvent(dispatchedEvent);
  else document.dispatchEvent(dispatchedEvent);
}

/**
 * Inicializa el router del admin. Idempotente.
 */
export function initAdminRouter() {
  initRouter((route) => {
    showSection(route.section, route.params);
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

/**
 * Sub-vista actualmente activa dentro de cursos (null si no es cursos).
 */
export function activeSubview() {
  return _currentSubview;
}
