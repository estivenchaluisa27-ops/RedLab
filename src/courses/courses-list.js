/**
 * src/courses/courses-list.js — Grid de cursos + select de profesores (admin dashboard)
 */
import { collection, query, where, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHtml, escapeAttr } from '../utils/escape.js';
import { animateListIn } from '../utils/motion.js';
import { showSkeleton } from '../utils/skeleton.js';
import { coverPattern } from '../utils/cover-pattern.js';

let _db = null;
let _state = null;
let unsubscribeCourses = null;
let coursesStaggered = false;
// Marca que ya llego el primer snapshot. Permite que otras vistas distingan
// "no hay cursos" de "aun estoy cargando", que antes se confundian.
let coursesLoaded = false;
// El menu de tres puntos vive dentro de la tarjeta, que se re-pinta entera en
// cada onSnapshot. Por eso no se guarda estado en una variable: se marca con un
// atributo data-abierto y se cierra solo al volver a pintar el grid.
let menuWired = false;

/** Cierra cualquier menu de tres puntos abierto dentro del grid. */
function closeCourseMenus(except) {
  document.querySelectorAll('#courses-grid [data-course-menu][data-abierto]').forEach(el => {
    if (el !== except) el.removeAttribute('data-abierto');
  });
  syncAriaExpanded();
}

/**
 * aria-expanded es lo que lee un lector de pantalla, asi que tiene que reflejar
 * el estado REAL del menu y no el valor fijo del HTML. Sin esto el boton
 * anuncia "contraido" con el menu abierto encima.
 */
function syncAriaExpanded() {
  document.querySelectorAll('#courses-grid [data-action="toggle-course-menu"]').forEach(btn => {
    const menu = btn.closest('.course-card')?.querySelector('[data-course-menu]');
    btn.setAttribute('aria-expanded', menu && menu.hasAttribute('data-abierto') ? 'true' : 'false');
  });
}

/**
 * Delegacion unica del grid para el menu de tres puntos. Se cablea una sola vez
 * porque el innerHTML se reemplaza en cada snapshot: si se enganchara el boton
 * directamente, habia que volver a engancharlo en cada repintado y se
 * acumulaban listeners.
 */
function wireCourseMenu(grid) {
  if (menuWired) return;
  menuWired = true;

  grid.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-action="toggle-course-menu"]');
    if (toggle) {
      e.stopPropagation();
      const menu = toggle.closest('.course-card').querySelector('[data-course-menu]');
      const willOpen = !menu.hasAttribute('data-abierto');
      closeCourseMenus();
      if (willOpen) menu.setAttribute('data-abierto', '');
      syncAriaExpanded();
      return;
    }
    // Cualquier clic dentro de un item del menu lo cierra antes de navegar.
    if (e.target.closest('[data-course-menu]')) closeCourseMenus();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.course-card')) closeCourseMenus();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCourseMenus();
  });
}

/**
 * @returns {boolean} true si el primer onSnapshot de cursos ya llego.
 */
export function hasCoursesLoaded() {
  return coursesLoaded;
}

export function initCoursesList(db, state) {
  _db = db;
  _state = state;
}

export function clearCoursesListener() {
  if (unsubscribeCourses) { unsubscribeCourses(); unsubscribeCourses = null; }
}

export function loadAdminDashboard() {
  const q = _state.role === 'admin' ? query(collection(_db, "courses")) : query(collection(_db, "courses"), where("professorEmail", "==", _state.user.email));

  clearCoursesListener();

  // Silueta antes del primer onSnapshot: sin esto el grid queda en blanco hasta
  // que Firestore responde. El render real sobrescribe el innerHTML.
  showSkeleton(document.getElementById('courses-grid'), { variant: 'card', count: 6 });

  unsubscribeCourses = onSnapshot(q, (snap) => {
    const grid = document.getElementById('courses-grid');
    if (!grid) return;
    coursesLoaded = true;
    grid.innerHTML = '';
    closeCourseMenus();
    const firstRender = !coursesStaggered;
    snap.forEach(d => {
      const c = d.data();
      _state.coursesCache[d.id] = c;
      const subject = escapeHtml(c.subject);

      // La portada se siembra con el id del curso: misma semilla, mismo patron
      // siempre. Se sembrara con el subject si el id cambia, para no perder la
      // identidad visual al reimportar cursos.
      const cover = coverPattern(d.id || subject);

      grid.innerHTML += `
        <div class="course-card bg-white rounded-[2px] border border-slate-200 card-lift relative overflow-hidden flex flex-col">
          <div class="course-cover" style="background-image:${cover}" role="img" aria-label="Portada decorativa de ${subject}"></div>
          <div class="p-5 flex flex-col flex-1">
            <div>
              <h3 class="font-bold text-lg text-slate-800">${subject}</h3>
              <span class="inline-block mt-1 bg-uce-100 text-uce-800 text-xs px-2 py-1 rounded font-bold">${escapeHtml(c.parallel)}</span>
            </div>
            <p class="text-sm text-slate-500 mt-1">${escapeHtml(c.career)}</p>
            <div class="mt-3 flex justify-between items-center gap-2 text-xs text-slate-400 border-t pt-2">
              <span class="truncate"><i class="fas fa-user mr-1"></i>${escapeHtml(c.professorEmail)}</span>
              <span class="font-bold text-slate-600 shrink-0"><i class="fas fa-clock mr-1"></i>${c.weeklyLimit}h/sem</span>
            </div>
            <div class="mt-2 flex items-stretch gap-2">
              <button data-action="open-course-manager" data-id="${escapeAttr(d.id)}" class="text-uce-700 font-bold hover:underline text-xs flex-1 py-1 bg-slate-50 rounded">Gestionar Grupos <i class="fas fa-arrow-right ml-1"></i></button>
              <div class="relative shrink-0">
                <button type="button" data-action="toggle-course-menu" class="course-menu-toggle" title="Mas opciones" aria-haspopup="menu" aria-expanded="false"><i class="fas fa-ellipsis-v"></i></button>
                <div data-course-menu role="menu" class="course-menu">
                  <button type="button" role="menuitem" data-action="open-edit-course" data-id="${escapeAttr(d.id)}" class="course-menu-item"><i class="fas fa-pencil-alt mr-2"></i>Editar curso</button>
                </div>
              </div>
            </div>
          </div>
        </div>`;
    });
    wireCourseMenu(grid);
    if (firstRender && grid.children.length) {
      coursesStaggered = true;
      animateListIn(grid);
    }
  });

  if (_state.role === 'admin') {
    getDocs(collection(_db, "professors")).then(snap => {
      const sel = document.getElementById('c-professor');
      if (!sel) return;
      sel.innerHTML = '<option value="">Seleccione Profesor...</option>';
      snap.forEach(d => { sel.innerHTML += `<option value="${d.id}">${escapeHtml(d.data().name)}</option>`; });
    });
  }
}
