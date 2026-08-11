/**
 * src/groups/group-details.js — Edición profunda de un grupo
 * Fase C: la tabla de integrantes es provista por MemberGrid custom vanilla
 *   (paste TSV, dedup, auto-save debounce, keyboard nav, Event API).
 *   Elimina renderMembersTable + addNewMember + saveMemberChange + deleteMember
 *   (la persistencia de miembros pasa a ser centralizada por onChange del grid).
 *   saveGroupBasicInfo y saveLeaderInfo siguen在此 para edición de nombre/líder.
 * El setup se invoca al entrar a la sub-view 'grupo-detalle' via router con
 *   params { courseId, groupId }. El botón "Atrás" vuelve a curso-grupos del mismo curso.
 */
import { getDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { alert as notifyAlert } from '../utils/notify.js';
import { clearGroupUtilsCache } from './group-utils.js';
import { navigate } from '../router.js';
import { mountMemberGrid } from './member-grid.js';

let editingGroupData = null;
let editingGroupId = null;
let _db = null;
let _state = null;
let _gridCleanup = null;

export function initGroupDetails(db, state) {
  _db = db;
  _state = state;
}

export function getEditingGroupId() { return editingGroupId; }
export function getEditingGroupData() { return editingGroupData; }

/**
 * Setup de la sub-view 'grupo-detalle'. Recibe params con courseId y groupId.
 * Carga el doc del grupo, rellena inputs y monta el MemberGrid.
 */
export async function setupGroupDetailsView(params) {
  const courseId = params && params.courseId;
  const groupId = params && params.groupId;
  if (!courseId || !groupId) {
    notifyAlert("Grupo no especificado.");
    navigate('#/admin/cursos');
    return;
  }

  // Limpiar grid previo si re-entramos a la sub-view (caso: ya había un grid montado)
  if (_gridCleanup) { try { _gridCleanup(); } catch (e) { /* noop: cleanup falló, igual marcamos null */ } _gridCleanup = null; }

  _state.currentViewCourse = courseId;
  editingGroupId = groupId;

  const backBtn = document.getElementById('grupo-detalle-back');
  if (backBtn) backBtn.href = `#/admin/cursos/${encodeURIComponent(courseId)}/grupos`;
  const backLabel = document.getElementById('grupo-detalle-back-label');
  if (backLabel) backLabel.textContent = 'Grupos';

  try {
    const docSnap = await getDoc(doc(_db, "courses", courseId, "groups", groupId));
    if (!docSnap.exists()) {
      notifyAlert("El grupo ya no existe.");
      navigate(`#/admin/cursos/${encodeURIComponent(courseId)}/grupos`);
      return;
    }

    editingGroupData = docSnap.data();

    document.getElementById('edit-group-name').value = editingGroupData.name;
    document.getElementById('edit-leader-email').value = editingGroupData.leader.email;
    document.getElementById('edit-leader-cedula').value = editingGroupData.leader.cedula;
    document.getElementById('edit-leader-name').value = editingGroupData.leader.fullName;

    const badge = document.getElementById('members-count-badge');
    const members = (editingGroupData.members) || [];
    if (badge) badge.innerText = members.length;

    // Montar el MemberGrid custom vanilla en el container reservado
    const gridContainer = document.getElementById('member-grid-container');
    if (gridContainer) {
      _gridCleanup = mountMemberGrid(gridContainer, {
        initialMembers: members,
        onChange: async (newMembers) => {
          if (!editingGroupData) return;
          await updateDoc(doc(_db, "courses", _state.currentViewCourse, "groups", editingGroupId), {
            members: newMembers
          });
          editingGroupData.members = newMembers;
          if (badge) badge.innerText = newMembers.length;
          clearGroupUtilsCache();   // memory #20: invalida el _membersCache de group-utils
        }
      });

      // Actualizar badge "Sin guardar" cuando grid marca dirty
      gridContainer.addEventListener('membergrid:dirty', (e) => {
        const badgeDirty = document.getElementById('members-dirty-badge');
        if (!badgeDirty) return;
        badgeDirty.classList.toggle('hidden', !e.detail.dirty);
      });
    }
  } catch (e) {
    console.error(e);
    notifyAlert("Error cargando grupo: " + e.message);
  }
}

/**
 * Limpieza total si el usuario abandona la sub-view (hook onLeave).
 * Desmonta el grid para evitar listeners zombie y snapshot leaks.
 */
export function destroyGroupDetailsView() {
  if (_gridCleanup) { try { _gridCleanup(); } catch (e) { /* noop: cleanup falló, igual marcamos null */ } _gridCleanup = null; }
  editingGroupData = null;
  editingGroupId = null;
}

export async function saveGroupBasicInfo() {
  const newName = document.getElementById('edit-group-name').value;
  if (!newName || !editingGroupData || !editingGroupId) return;
  try {
    await updateDoc(doc(_db, "courses", _state.currentViewCourse, "groups", editingGroupId), { name: newName });
    editingGroupData.name = newName;
    clearGroupUtilsCache();
    notifyAlert("Nombre actualizado.");
  } catch (e) { notifyAlert("Error: " + e.message); }
}

export async function saveLeaderInfo() {
  if (!editingGroupData || !editingGroupId) return;
  const newCedula = document.getElementById('edit-leader-cedula').value;
  const newName = document.getElementById('edit-leader-name').value;

  const updatedLeader = { ...editingGroupData.leader, cedula: newCedula, fullName: newName };
  const updatedMembers = (editingGroupData.members || []).map(m => {
    if (m.isLeader) return { ...m, cedula: newCedula, nombre: newName };
    return m;
  });

  try {
    await updateDoc(doc(_db, "courses", _state.currentViewCourse, "groups", editingGroupId), {
      leader: updatedLeader,
      members: updatedMembers
    });
    editingGroupData.leader = updatedLeader;
    editingGroupData.members = updatedMembers;
    clearGroupUtilsCache();
    const badge = document.getElementById('members-count-badge');
    if (badge) badge.innerText = updatedMembers.length;
    notifyAlert("Jefe de grupo actualizado.");
  } catch (e) { notifyAlert("Error: " + e.message); }
}
