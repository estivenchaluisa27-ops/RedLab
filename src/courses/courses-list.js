/**
 * src/courses/courses-list.js — Grid de cursos + select de profesores (admin dashboard)
 */
import { collection, query, where, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHtml, escapeAttr } from '../utils/escape.js';
import { animateListIn } from '../utils/motion.js';

let _db = null;
let _state = null;
let unsubscribeCourses = null;
let coursesStaggered = false;

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

  unsubscribeCourses = onSnapshot(q, (snap) => {
    const grid = document.getElementById('courses-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const firstRender = !coursesStaggered;
    snap.forEach(d => {
      const c = d.data();
      _state.coursesCache[d.id] = c;

      grid.innerHTML += `
        <div class="bg-white p-5 rounded-xl card-lift border-l-4 border-uce-700 hover:border-uce-500 relative group">
          <div class="flex justify-between items-start">
            <div>
              <h3 class="font-bold text-lg text-slate-800">${escapeHtml(c.subject)}</h3>
              <span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded font-bold">${escapeHtml(c.parallel)}</span>
            </div>
            <button data-action="open-edit-course" data-id="${escapeAttr(d.id)}" class="text-slate-400 hover:text-blue-600 p-1 bg-slate-50 rounded border border-transparent hover:border-blue-200 transition" title="Editar Curso Completo">
              <i class="fas fa-pencil-alt"></i>
            </button>
          </div>
          <p class="text-sm text-slate-500 mt-1">${escapeHtml(c.career)}</p>
          <div class="mt-3 flex justify-between items-center text-xs text-slate-400 border-t pt-2">
            <span><i class="fas fa-user mr-1"></i>${escapeHtml(c.professorEmail)}</span>
            <span class="font-bold text-slate-600"><i class="fas fa-clock mr-1"></i>${c.weeklyLimit}h/sem</span>
          </div>
          <div class="mt-2 text-center">
            <button data-action="open-course-manager" data-id="${escapeAttr(d.id)}" class="text-uce-700 font-bold hover:underline text-xs w-full py-1 bg-slate-50 rounded">Gestionar Grupos <i class="fas fa-arrow-right ml-1"></i></button>
          </div>
        </div>`;
    });
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
