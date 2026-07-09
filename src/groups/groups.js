/**
 * src/groups/groups.js — Gestión de grupos (crear, eliminar, abrir modal)
 */
import { collection, doc, writeBatch, deleteDoc, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHtml } from '../utils/escape.js';

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

export function openCourseManager(courseId) {
  _state.currentViewCourse = courseId;
  document.getElementById('modal-group-manage').classList.remove('hidden');

  clearGroupsListener();

  unsubscribeGroups = onSnapshot(collection(_db, "courses", courseId, "groups"), (snap) => {
    const tbody = document.getElementById('groups-table-body');
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
              <button onclick="window.openGroupDetails('${d.id}')" class="font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-2 transition-colors">
                  <span class="text-sm">${escapeHtml(g.name)}</span>
                  <i class="fas fa-external-link-alt text-[11px] text-blue-400"></i>
              </button>
          </td>
          <td class="py-3 text-xs text-slate-600 font-medium">${escapeHtml(g.leader.email)}</td>
          <td class="py-3 text-sm text-slate-700 font-bold text-center">${membersCount}</td>
          <td class="py-3 text-right pr-3 flex justify-end gap-2">
              <button onclick="window.deleteGroup('${d.id}')" class="text-red-400 hover:text-red-600 p-1 transition" title="Eliminar Grupo"><i class="fas fa-trash"></i></button>
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
      text: `El líder ${email} ya está registrado y puede ingresar al sistema.`,
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
      Swal.fire({
        title: '¡Eliminado!',
        text: 'El grupo ha sido borrado correctamente.',
        icon: 'success',
        confirmButtonColor: '#004274'
      });
    } catch (e) {
      alert("Error al eliminar: " + e.message);
    }
  }
}
