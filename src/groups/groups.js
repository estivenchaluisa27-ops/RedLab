/**
 * src/groups/groups.js — Gestión de grupos (crear, eliminar, abrir sub-view grupo-detalle)
 * Fase B: la lista de grupos vive en sub-view 'curso-grupos'. El listener de
 * Firestore se arranca al entrar a la sub-view y se limpia al salir
 * (registerSubviewOnLeave). openGroupDetails ahora navega a #/admin/cursos/:courseId/grupos/:groupId.
 */
import { collection, doc, writeBatch, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHtml, escapeAttr } from '../utils/escape.js';
import { alert as notifyAlert } from '../utils/notify.js';
import { clearGroupUtilsCache } from './group-utils.js';
import { navigate } from '../router.js';

let _db = null;
let _state = null;
let unsubscribeGroups = null;

export function initGroups(db, state) {
  _db = db;
  _state = state;
}

export function clearGroupsListener() {
  if (unsubscribeGroups) { unsubscribeGroups(); unsubscribeGroups = null; }
}

/**
 * Setup de la sub-view 'curso-grupos'. Recibe params con courseId.
 * Arranca el listener onSnapshot que pobla #groups-table-body. Es llamado
 * por el router cada vez que se entra a #/admin/cursos/:courseId/grupos.
 */
export function setupCourseGroupsView(params) {
  const courseId = params && params.courseId;
  if (!courseId) {
    notifyAlert("Curso no especificado.");
    navigate('#/admin/cursos');
    return;
  }
  _state.currentViewCourse = courseId;
  clearGroupsListener();

  unsubscribeGroups = onSnapshot(collection(_db, "courses", courseId, "groups"), (snap) => {
    const tbody = document.getElementById('groups-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    let groupsArray = [];
    snap.forEach(d => {
      groupsArray.push({ id: d.id, data: d.data() });
    });

    groupsArray.sort((a, b) => {
      const nameA = a.data.name || '';
      const nameB = b.data.name || '';
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });

    groupsArray.forEach(item => {
      const d = { id: item.id };
      const g = item.data;
      const membersCount = g.members ? g.members.length : 0;

      tbody.innerHTML += `
      <tr class="border-b last:border-0 hover:bg-slate-50 transition">
          <td class="py-3 pl-3">
              <button data-action="open-group-details" data-id="${escapeAttr(d.id)}" class="font-bold text-uce-600 hover:text-uce-700 hover:underline flex items-center gap-2 transition-colors">
                  <span class="text-sm">${escapeHtml(g.name)}</span>
                  <i class="fas fa-external-link-alt text-[11px] text-uce-400"></i>
              </button>
          </td>
          <td class="py-3 text-xs text-slate-600 font-medium">${escapeHtml(g.leader.email)}</td>
          <td class="py-3 text-sm text-slate-700 font-bold text-center">${membersCount}</td>
          <td class="py-3 text-right pr-3 flex justify-end gap-2">
              <button data-action="delete-group" data-id="${escapeAttr(d.id)}" class="text-red-400 hover:text-red-600 p-1 transition" title="Eliminar Grupo"><i class="fas fa-trash"></i></button>
          </td>
      </tr>`;
    });
  });
}

export async function addGroup() {
  const name = document.getElementById('new-group-name').value.trim();
  const emailRaw = document.getElementById('new-group-leader').value;
  const cedula = document.getElementById('new-group-cedula').value.trim();
  const fullName = document.getElementById('new-group-fullname').value.trim();

  if (!name || !emailRaw || !cedula || !fullName) {
    return Swal.fire({ icon: 'warning', text: 'Complete todos los campos.', confirmButtonColor: '#004274' });
  }

  const email = emailRaw.toLowerCase().trim();

  try {
    const batch = writeBatch(_db);

    const gRef = doc(_db, "courses", _state.currentViewCourse, "groups", email);
    batch.set(gRef, {
      name: name,
      leader: { email, cedula, fullName },
      members: [{ cedula, nombre: fullName, isLeader: true }]
    });

    const courseName = _state.coursesCache[_state.currentViewCourse] ? _state.coursesCache[_state.currentViewCourse].subject : _state.currentViewCourse;

    const dRef = doc(_db, "student_directory", email);
    batch.set(dRef, {
      courseId: _state.currentViewCourse,
      courseName: courseName,
      email: email,
      groupId: email,
      role: "student"
    });

    await batch.commit();

    document.getElementById('new-group-name').value = '';
    document.getElementById('new-group-leader').value = '';
    document.getElementById('new-group-cedula').value = '';
    document.getElementById('new-group-fullname').value = '';

    Swal.fire({
      icon: 'success',
      title: 'Grupo Creado',
      text: `El líder ${email} ya está habilitado. Debe crear su cuenta desde la página de inicio con su correo institucional @uce.edu.ec.`,
      timer: 3000,
      showConfirmButton: false
    });
  } catch (error) {
    Swal.fire({ icon: 'error', title: 'Error', text: error.message, confirmButtonColor: '#004274' });
  }
}

export async function deleteGroup(groupId) {
  const result = await Swal.fire({
    title: '¿Estás seguro?',
    text: "Se eliminará el grupo y el estudiante perderá el acceso al sistema.",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: '<i class="fas fa-trash mr-2"></i> Eliminar',
    cancelButtonText: 'Cancelar'
  });

  if (result.isConfirmed) {
    try {
      await deleteDoc(doc(_db, "courses", _state.currentViewCourse, "groups", groupId));
      await deleteDoc(doc(_db, "student_directory", groupId));
      clearGroupUtilsCache();
      Swal.fire({
        title: '¡Eliminado!',
        text: 'El grupo ha sido borrado correctamente.',
        icon: 'success',
        confirmButtonColor: '#004274'
      });
    } catch (e) {
      notifyAlert("Error al eliminar: " + e.message);
    }
  }
}
