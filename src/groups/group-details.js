/**
 * src/groups/group-details.js — Edición profunda de grupos (miembros, líder, nombre)
 */
import { getDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHtml } from '../utils/escape.js';
import { alert as notifyAlert, notifyConfirm } from '../utils/notify.js';

// Estado privado del módulo
let editingGroupData = null;
let editingGroupId = null;
let editingMemberIndex = -1;
let _db = null;
let _state = null;

export function initGroupDetails(db, state) {
  _db = db;
  _state = state;
}

export function getEditingGroupId() { return editingGroupId; }
export function getEditingGroupData() { return editingGroupData; }

export async function openGroupDetails(groupId) {
  editingGroupId = groupId;
  editingMemberIndex = -1;

  try {
    const docSnap = await getDoc(doc(_db, "courses", _state.currentViewCourse, "groups", groupId));
    if (!docSnap.exists()) return notifyAlert("El grupo ya no existe.");

    editingGroupData = docSnap.data();

    document.getElementById('edit-group-name').value = editingGroupData.name;
    document.getElementById('edit-leader-email').value = editingGroupData.leader.email;
    document.getElementById('edit-leader-cedula').value = editingGroupData.leader.cedula;
    document.getElementById('edit-leader-name').value = editingGroupData.leader.fullName;

    renderMembersTable();

    document.getElementById('modal-group-details').classList.remove('hidden');
  } catch (e) {
    console.error(e);
    notifyAlert("Error cargando grupo: " + e.message);
  }
}

export function renderMembersTable() {
  const tbody = document.getElementById('edit-members-tbody');
  const members = editingGroupData.members || [];
  document.getElementById('members-count-badge').innerText = members.length;
  tbody.innerHTML = '';

  members.forEach((mem, index) => {
    const isEditing = index === editingMemberIndex;
    const isLeader = mem.isLeader || false;

    let rowHtml = '';

    if (isEditing) {
      rowHtml = `
        <tr class="bg-blue-50 border-b border-slate-200">
          <td class="px-4 py-2"><input id="edit-mem-ced-${index}" value="${escapeHtml(mem.cedula)}" class="w-full p-1 border rounded text-sm"></td>
          <td class="px-4 py-2"><input id="edit-mem-name-${index}" value="${escapeHtml(mem.nombre)}" class="w-full p-1 border rounded text-sm"></td>
          <td class="px-4 py-3 text-xs">${isLeader ? '<span class="bg-[#004274] text-white px-2 py-0.5 rounded font-bold text-[10px]">LÍDER</span>' : '<span class="text-slate-400">Estudiante</span>'}</td>
          <td class="px-4 py-3 text-right flex justify-end gap-2">
            <button data-action="save-member-change" data-index="${index}" class="text-green-600 hover:text-green-800 bg-green-100 px-2 py-1 rounded text-xs font-bold"><i class="fas fa-check mr-1"></i>Guardar</button>
            <button data-action="cancel-member-edit" class="text-slate-500 hover:text-slate-700 text-xs px-2 py-1"><i class="fas fa-times"></i></button>
          </td>
        </tr>`;
    } else {
      rowHtml = `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-0">
          <td class="px-4 py-3 text-sm text-slate-600 font-medium">${escapeHtml(mem.cedula)}</td>
          <td class="px-4 py-3 text-sm text-slate-800 font-medium">${escapeHtml(mem.nombre)}</td>
          <td class="px-4 py-3 text-xs">
            ${isLeader
              ? '<span class="bg-[#004274] text-white px-2 py-0.5 rounded font-bold text-[10px]">LÍDER</span>'
              : '<span class="text-slate-400">Estudiante</span>'}
          </td>
          <td class="px-4 py-3 text-right flex justify-end gap-2">
            <button data-action="enable-member-edit" data-index="${index}" class="text-blue-500 hover:text-blue-700 bg-blue-50 p-1.5 rounded transition" title="Editar"><i class="fas fa-pencil-alt"></i></button>
            ${!isLeader ? `<button data-action="delete-member" data-index="${index}" class="text-red-400 hover:text-red-600 bg-red-50 p-1.5 rounded transition" title="Eliminar"><i class="fas fa-trash"></i></button>` : ''}
          </td>
        </tr>`;
    }
    tbody.innerHTML += rowHtml;
  });
}

export async function saveGroupBasicInfo() {
  const newName = document.getElementById('edit-group-name').value;
  if (!newName) return;
  try {
    await updateDoc(doc(_db, "courses", _state.currentViewCourse, "groups", editingGroupId), { name: newName });
    editingGroupData.name = newName;
    notifyAlert("Nombre actualizado.");
  } catch (e) { notifyAlert("Error: " + e.message); }
}

export async function saveLeaderInfo() {
  const newCedula = document.getElementById('edit-leader-cedula').value;
  const newName = document.getElementById('edit-leader-name').value;

  const updatedLeader = { ...editingGroupData.leader, cedula: newCedula, fullName: newName };
  const updatedMembers = editingGroupData.members.map(m => {
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
    renderMembersTable();
    notifyAlert("Jefe de grupo actualizado.");
  } catch (e) { notifyAlert("Error: " + e.message); }
}

export function enableMemberEdit(index) {
  editingMemberIndex = index;
  renderMembersTable();
}

export function cancelMemberEdit() {
  editingMemberIndex = -1;
  renderMembersTable();
}

export async function saveMemberChange(index) {
  const newCed = document.getElementById(`edit-mem-ced-${index}`).value;
  const newName = document.getElementById(`edit-mem-name-${index}`).value;

  if (!newCed || !newName) return notifyAlert("Datos vacíos");

  const updatedMembers = [...editingGroupData.members];
  updatedMembers[index].cedula = newCed;
  updatedMembers[index].nombre = newName;

  try {
    await updateDoc(doc(_db, "courses", _state.currentViewCourse, "groups", editingGroupId), {
      members: updatedMembers
    });
    editingGroupData.members = updatedMembers;
    editingMemberIndex = -1;
    renderMembersTable();
  } catch (e) { notifyAlert("Error guardando miembro: " + e.message); }
}

export async function deleteMember(index) {
  if (!await notifyConfirm("¿Seguro de eliminar a este integrante?")) return;

  const updatedMembers = editingGroupData.members.filter((_, i) => i !== index);

  try {
    await updateDoc(doc(_db, "courses", _state.currentViewCourse, "groups", editingGroupId), {
      members: updatedMembers
    });
    editingGroupData.members = updatedMembers;
    renderMembersTable();
  } catch (e) { notifyAlert("Error eliminando: " + e.message); }
}

export async function addNewMember() {
  const ced = document.getElementById('add-mem-cedula').value;
  const name = document.getElementById('add-mem-name').value;

  if (!ced || !name) return notifyAlert("Ingrese Cédula y Nombre");

  const newMember = { cedula: ced, nombre: name, isLeader: false };
  const updatedMembers = [...editingGroupData.members, newMember];

  try {
    await updateDoc(doc(_db, "courses", _state.currentViewCourse, "groups", editingGroupId), {
      members: updatedMembers
    });
    document.getElementById('add-mem-cedula').value = "";
    document.getElementById('add-mem-name').value = "";
    editingGroupData.members = updatedMembers;
    renderMembersTable();
  } catch (e) { notifyAlert("Error agregando: " + e.message); }
}
