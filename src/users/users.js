/**
 * src/users/users.js — Vista de Usuarios (tabs Admins/Profesores/Estudiantes)
 *
 * Setup invocado por registerSectionSetup('usuarios') en main.js.
 * Estado local de tabs (sin tocar el router).
 * CRUD vía users-store.js + import CSV vía csv-import.js.
 */
import { escapeHtml, escapeAttr } from '../utils/escape.js';
import { alert as notifyAlert, notifyConfirm } from '../utils/notify.js';
import { showSkeleton } from '../utils/skeleton.js';
import { coverPattern } from '../utils/cover-pattern.js';
import { animateListIn } from '../utils/motion.js';
import {
  initUsuarios,
  listAdmins,
  saveAdmin,
  deleteAdmin,
  listProfessors,
  saveProfessor,
  deleteProfessor,
  listStudentDirectory,
  moveStudent,
  deleteStudent,
} from './users-store.js';
import { parseMatriculaCSV, importMatriculaBatch } from './csv-import.js';

let _db = null;
let _state = null;
let _currentTab = 'admins';
let _directoryLoaded = false;

export function setupUsuariosView() {
  initUsuarios(_db, _state);
  renderTabs();
  loadTab(_currentTab);
}

function renderTabs() {
  const container = document.getElementById('usuarios-tabs');
  if (!container) return;

  const tabs = [
    { id: 'admins', label: 'Admins', icon: 'fa-user-shield' },
    { id: 'professors', label: 'Profesores', icon: 'fa-chalkboard-teacher' },
    { id: 'estudiantes', label: 'Estudiantes', icon: 'fa-user-graduate' },
  ];

  container.innerHTML = `
    <div class="flex gap-2 mb-6 border-b border-slate-200 pb-3">
      ${tabs.map((t) => `
        <button type="button" data-tab="${t.id}" class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${_currentTab === t.id ? 'bg-uce-700 text-white' : 'text-slate-600 hover:bg-slate-100'}">
          <i class="fas ${t.icon} mr-2"></i>${t.label}
        </button>
      `).join('')}
    </div>
    <div id="tab-content"></div>
  `;

  container.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      _currentTab = btn.dataset.tab;
      renderTabs();
      loadTab(_currentTab);
    });
  });
}

async function loadTab(tab) {
  const content = document.getElementById('tab-content');
  if (!content) return;

  if (tab === 'admins') await loadAdminsTab(content);
  else if (tab === 'professors') await loadProfessorsTab(content);
  else if (tab === 'estudiantes') await loadEstudiantesTab(content);
}

// ─── Tab: Admins ─────────────────────────────────────────────────────────────

async function loadAdminsTab(container) {
  showSkeleton(container, { variant: 'row', count: 4 });

  try {
    const admins = await listAdmins();
    container.innerHTML = `
      <div class="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold text-slate-700">Administradores</h3>
          <button type="button" data-action="add-admin" class="bg-uce-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-uce-800 transition-colors">
            <i class="fas fa-plus mr-2"></i>Nuevo Admin
          </button>
        </div>
        <div class="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <i class="fas fa-info-circle mr-2"></i>Las cuentas Auth huérfanas se borran en Firebase Console.
        </div>
        <div class="grid gap-3">
          ${admins.map((a) => `
            <div class="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              <div>
                <div class="font-medium text-slate-700">${escapeHtml(a.name)}</div>
                <div class="text-sm text-slate-500">${escapeHtml(a.email)}</div>
              </div>
              <button type="button" data-action="delete-admin" data-email="${escapeAttr(a.email)}" class="text-red-400 hover:text-red-600 p-2 transition" title="Eliminar">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    wireAdminsActions(container);
  } catch (err) {
    notifyAlert('Error cargando admins: ' + err.message);
  }
}

function wireAdminsActions(container) {
  container.querySelector('[data-action="add-admin"]')?.addEventListener('click', () => {
    showAdminForm();
  });

  container.querySelectorAll('[data-action="delete-admin"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.dataset.email;
      const confirmed = await notifyConfirm(`¿Eliminar admin ${email}?`);
      if (!confirmed) return;
      try {
        await deleteAdmin(email, _state.user.email);
        notifyAlert('Admin eliminado.');
        loadAdminsTab(container);
      } catch (err) {
        notifyAlert(err.message);
      }
    });
  });
}

function showAdminForm() {
  const content = document.getElementById('tab-content');
  if (!content) return;

  content.innerHTML = `
    <div class="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
      <h3 class="text-lg font-bold text-slate-700 mb-4">Nuevo Administrador</h3>
      <form data-action="save-admin" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
          <input type="text" name="name" required class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-uce-500 outline-none text-sm">
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input type="email" name="email" required class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-uce-500 outline-none text-sm">
        </div>
        <div class="flex gap-2">
          <button type="submit" class="bg-uce-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-uce-800 transition-colors">Guardar</button>
          <button type="button" data-action="cancel-admin-form" class="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-300 transition-colors">Cancelar</button>
        </div>
      </form>
    </div>
  `;

  content.querySelector('[data-action="cancel-admin-form"]')?.addEventListener('click', () => loadAdminsTab(content));
}

// ─── Tab: Profesores ─────────────────────────────────────────────────────────

async function loadProfessorsTab(container) {
  showSkeleton(container, { variant: 'row', count: 4 });

  try {
    const professors = await listProfessors();
    container.innerHTML = `
      <div class="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold text-slate-700">Profesores</h3>
          <button type="button" data-action="add-professor" class="bg-uce-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-uce-800 transition-colors">
            <i class="fas fa-plus mr-2"></i>Nuevo Profesor
          </button>
        </div>
        <div class="grid gap-3">
          ${professors.map((p) => `
            <div class="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              <div>
                <div class="font-medium text-slate-700">${escapeHtml(p.name)}</div>
                <div class="text-sm text-slate-500">${escapeHtml(p.email)}</div>
              </div>
              <button type="button" data-action="delete-professor" data-email="${escapeAttr(p.email)}" class="text-red-400 hover:text-red-600 p-2 transition" title="Eliminar">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    wireProfessorsActions(container);
  } catch (err) {
    notifyAlert('Error cargando profesores: ' + err.message);
  }
}

function wireProfessorsActions(container) {
  container.querySelector('[data-action="add-professor"]')?.addEventListener('click', () => {
    showProfessorForm();
  });

  container.querySelectorAll('[data-action="delete-professor"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.dataset.email;
      const confirmed = await notifyConfirm(`¿Eliminar profesor ${email}?`);
      if (!confirmed) return;
      try {
        await deleteProfessor(email);
        notifyAlert('Profesor eliminado.');
        loadProfessorsTab(container);
      } catch (err) {
        notifyAlert(err.message);
      }
    });
  });
}

function showProfessorForm() {
  const content = document.getElementById('tab-content');
  if (!content) return;

  content.innerHTML = `
    <div class="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
      <h3 class="text-lg font-bold text-slate-700 mb-4">Nuevo Profesor</h3>
      <form data-action="save-professor" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
          <input type="text" name="name" required class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-uce-500 outline-none text-sm">
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input type="email" name="email" required class="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-uce-500 outline-none text-sm">
        </div>
        <div class="flex gap-2">
          <button type="submit" class="bg-uce-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-uce-800 transition-colors">Guardar</button>
          <button type="button" data-action="cancel-professor-form" class="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-300 transition-colors">Cancelar</button>
        </div>
      </form>
    </div>
  `;

  content.querySelector('[data-action="cancel-professor-form"]')?.addEventListener('click', () => loadProfessorsTab(content));
}

// ─── Tab: Estudiantes ────────────────────────────────────────────────────────

async function loadEstudiantesTab(container) {
  showSkeleton(container, { variant: 'row', count: 6 });

  try {
    const students = await listStudentDirectory();
    _directoryLoaded = true;

    container.innerHTML = `
      <div class="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold text-slate-700">Estudiantes</h3>
          <div class="flex gap-2">
            <input type="text" id="student-search" placeholder="Buscar email..." class="p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-uce-500 outline-none">
            <select id="student-course-filter" class="p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-uce-500 outline-none">
              <option value="">Todos los cursos</option>
              ${Object.entries(_state.coursesCache || {}).map(([id, c]) => `<option value="${escapeAttr(id)}">${escapeHtml(c.subject)}</option>`).join('')}
            </select>
            <button type="button" data-action="import-csv" class="bg-uce-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-uce-800 transition-colors">
              <i class="fas fa-file-csv mr-2"></i>Import CSV
            </button>
          </div>
        </div>
        <div class="grid gap-3">
          ${students.map((s) => `
            <div class="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              <div>
                <div class="font-medium text-slate-700">${escapeHtml(s.email)}</div>
                <div class="text-sm text-slate-500">${escapeHtml(s.courseName || s.courseId)} · ${escapeHtml(s.groupId)}</div>
              </div>
              <div class="flex gap-2">
                <button type="button" data-action="move-student" data-email="${escapeAttr(s.email)}" class="text-uce-600 hover:text-uce-800 p-2 transition" title="Mover">
                  <i class="fas fa-exchange-alt"></i>
                </button>
                <button type="button" data-action="delete-student" data-email="${escapeAttr(s.email)}" class="text-red-400 hover:text-red-600 p-2 transition" title="Eliminar">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    wireEstudiantesActions(container);
  } catch (err) {
    notifyAlert('Error cargando estudiantes: ' + err.message);
  }
}

function wireEstudiantesActions(container) {
  container.querySelector('[data-action="import-csv"]')?.addEventListener('click', () => {
    showCSVImportForm();
  });

  container.querySelector('#student-search')?.addEventListener('input', (e) => {
    filterStudents(e.target.value, container);
  });

  container.querySelector('#student-course-filter')?.addEventListener('change', (e) => {
    filterStudentsByCourse(e.target.value, container);
  });

  container.querySelectorAll('[data-action="move-student"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.dataset.email;
      showMoveStudentForm(email, container);
    });
  });

  container.querySelectorAll('[data-action="delete-student"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.dataset.email;
      const confirmed = await notifyConfirm(`¿Eliminar estudiante ${email}? Se revocará su acceso.`);
      if (!confirmed) return;
      try {
        await deleteStudent(email);
        notifyAlert('Estudiante eliminado.');
        loadEstudiantesTab(container);
      } catch (err) {
        notifyAlert(err.message);
      }
    });
  });
}

function filterStudents(search, container) {
  const query = search.toLowerCase();
  container.querySelectorAll('.grid > div').forEach((row) => {
    const email = row.querySelector('.font-medium')?.textContent?.toLowerCase() || '';
    row.style.display = email.includes(query) ? '' : 'none';
  });
}

function filterStudentsByCourse(courseId, container) {
  if (!courseId) {
    container.querySelectorAll('.grid > div').forEach((row) => row.style.display = '');
    return;
  }
  container.querySelectorAll('.grid > div').forEach((row) => {
    const text = row.textContent || '';
    row.style.display = text.includes(courseId) ? '' : 'none';
  });
}

function showCSVImportForm() {
  const content = document.getElementById('tab-content');
  if (!content) return;

  content.innerHTML = `
    <div class="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
      <h3 class="text-lg font-bold text-slate-700 mb-4">Importar CSV de Matrícula</h3>
      <p class="text-sm text-slate-600 mb-4">Formato: <code class="bg-slate-100 px-1 rounded">email,cedula,nombre,cursoId,grupo</code></p>
      <form data-action="submit-csv-import" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Archivo CSV</label>
          <input type="file" name="csvFile" accept=".csv" required class="w-full p-2 border border-slate-300 rounded-lg text-sm">
        </div>
        <div class="flex gap-2">
          <button type="submit" class="bg-uce-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-uce-800 transition-colors">Importar</button>
          <button type="button" data-action="cancel-csv-form" class="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-300 transition-colors">Cancelar</button>
        </div>
      </form>
    </div>
  `;

  content.querySelector('[data-action="cancel-csv-form"]')?.addEventListener('click', () => loadEstudiantesTab(content));
}

function showMoveStudentForm(email, container) {
  const courses = Object.entries(_state.coursesCache || {});
  if (courses.length === 0) {
    notifyAlert('No hay cursos disponibles.');
    return;
  }

  container.innerHTML = `
    <div class="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
      <h3 class="text-lg font-bold text-slate-700 mb-4">Mover Estudiante</h3>
      <p class="text-sm text-slate-600 mb-4">Email: <strong>${escapeHtml(email)}</strong></p>
      <form data-action="submit-move-student" class="space-y-4">
        <input type="hidden" name="email" value="${escapeAttr(email)}">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Curso Destino</label>
          <select name="targetCourseId" required class="w-full p-2 border border-slate-300 rounded-lg text-sm">
            ${courses.map(([id, c]) => `<option value="${escapeAttr(id)}">${escapeHtml(c.subject)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Grupo Destino</label>
          <input type="text" name="targetGroupId" required class="w-full p-2 border border-slate-300 rounded-lg text-sm" placeholder="Email del líder del grupo">
        </div>
        <div class="flex gap-2">
          <button type="submit" class="bg-uce-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-uce-800 transition-colors">Mover</button>
          <button type="button" data-action="cancel-move-form" class="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-300 transition-colors">Cancelar</button>
        </div>
      </form>
    </div>
  `;

  container.querySelector('[data-action="cancel-move-form"]')?.addEventListener('click', () => loadEstudiantesTab(container));
}

// ─── Form submit handlers (llamados desde main.js dispatcher) ────────────────

export async function handleSaveAdmin(e) {
  e.preventDefault();
  const form = e.target;
  const name = form.name.value.trim();
  const email = form.email.value.trim();
  try {
    await saveAdmin(email, name);
    notifyAlert('Admin guardado.');
    loadAdminsTab(document.getElementById('tab-content'));
  } catch (err) {
    notifyAlert(err.message);
  }
}

export async function handleSaveProfessor(e) {
  e.preventDefault();
  const form = e.target;
  const name = form.name.value.trim();
  const email = form.email.value.trim();
  try {
    await saveProfessor(email, name);
    notifyAlert('Profesor guardado.');
    loadProfessorsTab(document.getElementById('tab-content'));
  } catch (err) {
    notifyAlert(err.message);
  }
}

export async function handleCSVImport(e) {
  e.preventDefault();
  const form = e.target;
  const file = form.csvFile.files[0];
  if (!file) {
    notifyAlert('Seleccione un archivo CSV.');
    return;
  }

  const text = await file.text();
  const { rows, errors } = parseMatriculaCSV(text);

  if (errors.length > 0) {
    notifyAlert(`Errores en ${errors.length} filas. Revise el formato.`);
  }

  if (rows.length === 0) {
    notifyAlert('No hay filas válidas para importar.');
    return;
  }

  try {
    const result = await importMatriculaBatch(_db, rows, _state.coursesCache);
    notifyAlert(`Importados: ${result.success}, Errores: ${result.errors.length}`);
    loadEstudiantesTab(document.getElementById('tab-content'));
  } catch (err) {
    notifyAlert('Error importando: ' + err.message);
  }
}

export async function handleMoveStudent(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.email.value;
  const targetCourseId = form.targetCourseId.value;
  const targetGroupId = form.targetGroupId.value.trim();

  try {
    await moveStudent(email, targetCourseId, targetGroupId);
    notifyAlert('Estudiante movido.');
    loadEstudiantesTab(document.getElementById('tab-content'));
  } catch (err) {
    notifyAlert(err.message);
  }
}
