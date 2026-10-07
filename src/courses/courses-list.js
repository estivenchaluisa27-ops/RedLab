/**
 * src/courses/courses-list.js — Grid de cursos + select de profesores (admin dashboard)
 */
import { collection, query, where, onSnapshot, getDocs } from '../firebase-config.js';
import { escapeHtml, escapeAttr } from '../utils/escape.js';
import { animateListIn } from '../utils/motion.js';
import { registerListener, unregisterListener } from '../state.js';
import { showSkeleton } from '../utils/skeleton.js';
import { coverPattern } from '../utils/cover-pattern.js';

let _db = null;
let _state = null;
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
  unregisterListener('courses:list');
}

export function loadAdminDashboard() {
  const q = _state.role === 'admin' ? query(collection(_db, "courses")) : query(collection(_db, "courses"), where("professorEmail", "==", _state.user.email));

  clearCoursesListener();

  // Silueta antes del primer onSnapshot: sin esto el grid queda en blanco hasta
  // que Firestore responde. El render real sobrescribe el innerHTML.
  showSkeleton(document.getElementById('courses-grid'), { variant: 'card', count: 6 });

  registerListener('courses:list', onSnapshot(q, (snap) => {
    const grid = document.getElementById('courses-grid');
    if (!grid) return;
    coursesLoaded = true;
    grid.innerHTML = '';
    closeCourseMenus();
    const firstRender = !coursesStaggered;
    // Desplaza la paleta por posición en la grilla: dos tarjetas vecinas
    // jamás repiten paleta aunque el sorteo por hash colisione en la vista.
    let coverIndex = 0;
    snap.forEach(d => {
      const c = d.data();
      _state.coursesCache[d.id] = c;
      const subject = escapeHtml(c.subject);

      // La portada se siembra con el id del curso: misma semilla, mismo patron
      // siempre. Se sembrara con el subject si el id cambia, para no perder la
      // identidad visual al reimportar cursos.
      const cover = coverPattern(d.id || subject, coverIndex);
      coverIndex += 1;

      grid.innerHTML += `
        <div class="course-card bg-white rounded-lg border border-slate-200 card-lift relative overflow-hidden flex flex-col">
          <div class="course-cover" style="background-image:${cover}" role="img" aria-label="Portada decorativa de ${subject}"></div>
          <div class="p-3 flex flex-col flex-1">
            <h3 class="text-sm font-normal uppercase tracking-wide text-sky-600 leading-snug line-clamp-3">${subject}</h3>
            <div class="flex justify-between items-start mt-1 gap-2">
              <p class="text-sm font-normal text-slate-600 leading-tight">${escapeHtml(c.career)}</p>
              <span class="text-sm font-normal text-slate-600 shrink-0">${escapeHtml(c.parallel)}</span>
            </div>
            <div class="mt-auto pt-2 flex justify-between items-center gap-2 text-sm font-normal text-slate-600 border-t border-slate-100">
              <span class="truncate"><i class="fas fa-user mr-1"></i>${escapeHtml(c.professorEmail)}</span>
              <div class="flex items-center gap-2 shrink-0">
                <span class="font-normal text-slate-600"><i class="fas fa-clock mr-1"></i>${c.weeklyLimit ?? 4}h/sem</span>
                <div class="relative flex items-center">
                  <button type="button" data-action="toggle-course-menu" class="course-menu-toggle" title="Opciones" aria-haspopup="menu" aria-expanded="false"><i class="fas fa-ellipsis-v"></i></button>
                  <div data-course-menu role="menu" class="course-menu">
                    <button type="button" role="menuitem" data-action="open-course-manager" data-id="${escapeAttr(d.id)}" class="course-menu-item"><i class="fas fa-users-cog w-4 mr-2 text-center"></i>Gestionar Grupos</button>
                    <button type="button" role="menuitem" data-action="open-edit-course" data-id="${escapeAttr(d.id)}" class="course-menu-item"><i class="fas fa-pencil-alt w-4 mr-2 text-center"></i>Editar curso</button>
                  </div>
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
  }));

  if (_state.role === 'admin') {
    getDocs(collection(_db, "professors")).then(snap => {
      const sel = document.getElementById('c-professor');
      if (!sel) return;
      sel.innerHTML = '<option value="">Seleccione Profesor...</option>';
      snap.forEach(d => { sel.innerHTML += `<option value="${escapeAttr(d.id)}">${escapeHtml(d.data().name)}</option>`; });
    });
  }
}
