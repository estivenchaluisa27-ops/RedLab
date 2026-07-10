/**
 * src/courses/courses-list.js — Grid de cursos + select de profesores (admin dashboard)
 */
import { collection, query, where, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHtml } from '../utils/escape.js';

let _db = null;
let _state = null;
let unsubscribeCourses = null;

export function initCoursesList(db, state) {
  _db = db;
  _state = state;
}

export function clearCoursesListener() {
  if (unsubscribeCourses) { unsubscribeCourses(); unsubscribeCourses = null; }
}

export function loadAdminDashboard() {
  window.switchTab('calendar');
  const q = _state.role === 'admin' ? query(collection(_db, "courses")) : query(collection(_db, "courses"), where("professorEmail", "==", _state.user.email));

  clearCoursesListener();

  unsubscribeCourses = onSnapshot(q, (snap) => {
    const grid = document.getElementById('courses-grid');
    grid.innerHTML = '';
    snap.forEach(d => {
      const c = d.data();
      _state.coursesCache[d.id] = c;

      grid.innerHTML += `
        <div class="bg-white p-5 rounded-lg shadow border-l-4 border-[#004274] hover:shadow-lg transition relative group">
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
            <button data-action="open-course-manager" data-id="${escapeAttr(d.id)}" class="text-[#004274] font-bold hover:underline text-xs w-full py-1 bg-slate-50 rounded">Gestionar Grupos <i class="fas fa-arrow-right ml-1"></i></button>
          </div>
        </div>`;
    });
  });

  if (_state.role === 'admin') {
    getDocs(collection(_db, "professors")).then(snap => {
      const sel = document.getElementById('c-professor');
      sel.innerHTML = '<option value="">Seleccione Profesor...</option>';
      snap.forEach(d => { sel.innerHTML += `<option value="${d.id}">${escapeHtml(d.data().name)}</option>`; });
    });
  }

  if (typeof window._setupAdminCalendarLogic === 'function') window._setupAdminCalendarLogic();
}
