/**
 * src/router.js — Hash router para el panel admin
 *
 * Patrón: window.addEventListener('hashchange', ...) — Baseline Widely available
 * desde julio 2015 (MDN, Web/API/Window/hashchange_event).
 * No usa history.pushState ni popstate intencionalmente: pushState NO dispara
 * hashchange (MDN, History.pushState) y la navegación por hash es suficiente
 * para el panel admin de RedLab. El botón Atrás del navegador funciona
 * "gratis" porque cada navigate agrega una entrada real al historial de hash.
 *
 * Contrato público:
 *   initRouter(onRoute) — arranca el listener y dispara la primera ruta.
 *   navigate(path)     — window.location.hash = path (no dispara manualmente;
 *                         hashchange lo recibe y llamará a onRoute).
 *   currentSection()   — sección parseada de la URL actual.
 *   onBeforeLeave(cb)  — registra hook pre-salida; cb() retorna true para
 *                         permitir el cambio, false/string para bloquear.
 */

let _onRoute = null;
let _beforeLeaveCbs = [];
let _hashHandler = null;

const SECTIONS = ['calendario', 'cursos', 'grupos', 'reportes', 'ajustes'];

/**
 * Parsea el hash actual en { section, params }.
 * Hashes soportados (FASE A):
 *   #/admin/calendario                 → { section: 'calendario', params: {} }
 *   #/admin/cursos                     → { section: 'cursos',     params: {} }
 * FASE B agregará sub-rutas con params (cursoId, groupId). Por ahora, lo que
 * no matchee cae a 'calendario' como default seguro.
 * @returns {{ section: string, params: object }}
 */
export function parseHash() {
  const raw = window.location.hash.replace(/^#/, '');
  const parts = raw.split('/').filter(Boolean); // ['admin', 'calendario', ...]
  if (parts[0] !== 'admin' || !parts[1]) {
    return { section: 'calendario', params: {} };
  }
  const section = SECTIONS.includes(parts[1]) ? parts[1] : 'calendario';
  // FASE A: solo sección, sin sub-params. Reserve params parsing para Fase B.
  return { section, params: {} };
}

/**
 * Sección actual (top-level string).
 * @returns {string}
 */
export function currentSection() {
  return parseHash().section;
}

/**
 * Cambia la ruta del navegador. No dispara el handler manualmente:
 * confiamos en el evento `hashchange` que MDN documenta como el path estándar.
 * Si el hash nuevo es identical al actual, hashchange no se dispara —
 * forzamos una llamada manual en ese caso para no romper el click repetido.
 * @param {string} path — ej. '#/admin/cursos' o '/admin/cursos'
 */
export function navigate(path) {
  const normalized = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : `/${path}`}`;
  if (window.location.hash === normalized) {
    // Mismo hash: hashchange no se dispara; llamamos directo.
    if (_onRoute) _onRoute(parseHash());
  } else {
    window.location.hash = normalized;
  }
}

/**
 * Registra un callback que se ejecuta ANTES de cambiar de sección.
 * El callback recibe (fromSection, toSection) y debe retornar:
 *   - true           → permitir navegación
 *   - false / string → bloquear (si string, es el motivo para mostrar al user)
 * @param {(from: string, to: string) => boolean|string} cb
 * @returns {() => void} función para desuscribir
 */
export function onBeforeLeave(cb) {
  _beforeLeaveCbs.push(cb);
  return () => {
    _beforeLeaveCbs = _beforeLeaveCbs.filter(fn => fn !== cb);
  };
}

/**
 * Inicializa el router.
 * Idempotente: si se llama más veces, reemplaza el onRoute sin agregar
 * listeners duplicados a window (importante para tests y HMR).
 * @param {(route: { section: string, params: object }) => void} onRoute
 *     Se llama cada vez que cambia el hash (y al init). Recibe la ruta parseada.
 */
export function initRouter(onRoute) {
  _onRoute = onRoute;
  if (_hashHandler) {
    // Ya inicializado: sólo actualizar el callback, sin duplicar listener.
    if (_onRoute) _onRoute(parseHash());
    return;
  }
  _hashHandler = () => {
    if (_onRoute) _onRoute(parseHash());
  };
  window.addEventListener('hashchange', _hashHandler);
  // Disparar la ruta inicial (si hash vacío, parseHash retorna el default).
  if (_onRoute) _onRoute(parseHash());
}

/**
 * Desconecta el router: remueve el listener de window y limpia callbacks.
 * Útil para tests y para resetear state entre sesiones (logout).
 */
export function destroyRouter() {
  if (_hashHandler) {
    window.removeEventListener('hashchange', _hashHandler);
    _hashHandler = null;
  }
  _onRoute = null;
  _beforeLeaveCbs = [];
}
