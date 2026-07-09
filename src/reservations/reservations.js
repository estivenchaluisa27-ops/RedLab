/**
 * src/reservations/reservations.js — Reservas, asistencia, bloqueos
 */
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc, deleteDoc, writeBatch, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHtml } from '../utils/escape.js';
import { lookupMembersByGroupName } from '../groups/group-utils.js';
import { updateAdminActionBox, updateStudentUI } from '../calendar/calendar.js';

let _db = null;
let _state = null;
let _RESERVATIONS_COLLECTION = null;

export function initReservations(db, state, RESERVATIONS_COLLECTION) {
  _db = db;
  _state = state;
  _RESERVATIONS_COLLECTION = RESERVATIONS_COLLECTION;
}

export async function batchBlockAction(action) {
  const batch = writeBatch(_db);
  _state.selectedSlots.forEach(id => {
    const [d, h] = id.split('_');
    const blockId = `BLOCK_${d}_${h}`;
    const ref = doc(_db, _RESERVATIONS_COLLECTION, blockId);
    if (action === 'block') batch.set(ref, { date: d, hour: parseInt(h), status: 'blocked', userId: 'ADMIN', createdAt: serverTimestamp() });
    else batch.delete(ref);
  });
  await batch.commit();
  _state.selectedSlots = [];
  updateAdminActionBox();
}

export async function submitReservation() {
  const btn = document.getElementById('submit-request-btn');

  if (_state.selectedSlots.length === 0) return alert("Selecciona al menos una hora.");

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';

  try {
    const limit = _state.weeklyLimit || 4;
    const newSlotsCount = _state.selectedSlots.length;

    const firstSlotDate = _state.selectedSlots[0].split('_')[0];
    const dateObj = new Date(firstSlotDate + "T12:00:00");

    const day = dateObj.getDay();
    const diffToMon = dateObj.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(dateObj.setDate(diffToMon));
    const friday = new Date(dateObj.setDate(diffToMon + 4));

    const { formatDateYYYYMMDD } = await import('../utils/dates.js');
    const startStr = formatDateYYYYMMDD(monday);
    const endStr = formatDateYYYYMMDD(friday);

    const q = query(
      collection(_db, _RESERVATIONS_COLLECTION),
      where("courseId", "==", _state.courseId),
      where("groupName", "==", _state.groupName),
      where("date", ">=", startStr),
      where("date", "<=", endStr)
    );

    const snap = await getDocs(q);
    let existingCount = 0;

    snap.forEach(doc => {
      const st = doc.data().status;
      if (st === 'approved' || st === 'pending') existingCount++;
    });

    const total = existingCount + newSlotsCount;

    if (total > limit) {
      const remaining = Math.max(0, limit - existingCount);
      alert(` LÍMITE EXCEDIDO\n\nEste curso permite máximo ${limit} horas por semana.\nYa tienes: ${existingCount} horas (agendadas o pendientes).\nIntentas pedir: ${newSlotsCount} horas.\n\nSolo puedes pedir: ${remaining} horas más esta semana.`);
      btn.disabled = false;
      btn.innerText = "Confirmar";
      return;
    }

    const batch = writeBatch(_db);
    _state.selectedSlots.forEach(id => {
      const [d, h] = id.split('_');
      const ref = doc(collection(_db, _RESERVATIONS_COLLECTION));
      batch.set(ref, {
        date: d, hour: parseInt(h), status: 'pending', userId: _state.user.uid,
        groupName: _state.groupName,
        courseId: _state.courseId,
        createdAt: serverTimestamp()
      });
    });

    await batch.commit();
    _state.selectedSlots = [];
    updateStudentUI();

    Swal.fire({
      icon: 'success',
      title: '¡Solicitud Enviada!',
      html: `
        <p class="text-sm text-slate-600 mb-4">Tu solicitud ha sido registrada correctamente.</p>
        <p class="text-sm font-bold text-slate-700">
            El turno será confirmado cuando un encargado del laboratorio acepte dicha solicitud.
        </p>
      `,
      confirmButtonColor: '#004274',
      confirmButtonText: 'ENTENDIDO',
      customClass: {
        popup: 'rounded-2xl shadow-2xl',
        confirmButton: 'w-full py-3 rounded-lg font-bold tracking-wider text-xs uppercase'
      }
    });
  } catch (error) {
    console.error(error);
    alert("Error al procesar solicitud: " + error.message);
  } finally {
    btn.disabled = false;
    btn.innerText = "Confirmar";
  }
}

export async function admAct(id, app, d, h, gn) {
  const s = await getDocs(query(collection(_db, _RESERVATIONS_COLLECTION), where("date", "==", d), where("hour", "==", h), where("status", "in", ["approved", "blocked"])));
  if (s.docs.find(x => x.data().status === 'blocked')) return alert("Horario bloqueado.");
  const uniqueApproved = new Set(s.docs.filter(doc => doc.data().status === 'approved').map(doc => doc.data().groupName)).size;
  if (uniqueApproved >= 4) return alert("Horario lleno.");
  updateDoc(doc(_db, _RESERVATIONS_COLLECTION, id), { status: 'approved' });
}

export async function rejectReq(id) {
  const result = await Swal.fire({
    title: '¿Rechazar solicitud?',
    text: "El grupo perderá este turno y se liberará el horario.",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: '<i class="fas fa-times mr-1"></i> Sí, rechazar',
    cancelButtonText: 'Cancelar'
  });
  if (result.isConfirmed) {
    await deleteDoc(doc(_db, _RESERVATIONS_COLLECTION, id));
  }
}

export async function deleteReservation(id) {
  try {
    await deleteDoc(doc(_db, _RESERVATIONS_COLLECTION, id));
    document.getElementById('attendance-modal').classList.add('hidden');
  } catch (e) {
    alert("Error eliminando");
  }
}

export async function openAttendanceModal(date, hour, reservations) {
  const modal = document.getElementById('attendance-modal');
  document.getElementById('att-title').innerText = `Gestión: ${date} - ${hour}:00`;
  const list = document.getElementById('att-list');
  list.innerHTML = '<div class="p-8 text-center text-slate-500"><i class="fas fa-spinner fa-spin text-3xl mb-2"></i><br>Cargando integrantes...</div>';
  modal.classList.remove('hidden');

  const approved = reservations.filter(r => r.status === 'approved');
  const grouped = {};
  approved.forEach(r => { if (!grouped[r.groupName]) grouped[r.groupName] = r; });

  list.innerHTML = '';
  for (const groupName in grouped) {
    const res = grouped[groupName];

    let students = [];
    if (res.courseId) {
      students = await lookupMembersByGroupName(_db, res.courseId, groupName);
    }

    const groupDiv = document.createElement('div');
    groupDiv.className = 'border border-slate-200 rounded-lg mb-4 bg-white overflow-hidden shadow-sm';
    let html = `<div class="bg-slate-50 p-3 flex justify-between items-center border-b border-slate-200"><span class="font-bold text-slate-700 text-sm"><i class="fas fa-users mr-2 text-blue-500"></i>${escapeHtml(res.groupName)}</span><button onclick="window.deleteReservation('${res.id}')" class="text-red-500 text-xs font-medium border border-red-200 bg-white px-2 py-1 rounded">Derrogar</button></div><div class="p-0">`;

    if (students.length === 0) {
      html += '<p class="text-sm text-gray-400 italic p-4 text-center">No se encontraron integrantes (Reserva antigua o grupo borrado).</p>';
    } else {
      const att = res.attendanceDetail || {};
      students.forEach((st) => {
        const isPresent = att[st.cedula] === true;
        const isAbsent = att[st.cedula] === false;
        const badge = st.isLeader ? '<span class="badge-jf">JF</span>' : '';
        html += `<div class="flex justify-between items-center p-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
          <div>
            <div class="text-sm font-medium text-slate-700 flex items-center">${escapeHtml(st.nombre)} ${badge}</div>
            <div class="text-sm text-slate-500 font-medium">${escapeHtml(st.cedula)}</div>
          </div>
          <div class="flex gap-2">
            <div onclick="window.setAttendance('${res.groupName}','${escapeHtml(res.date)}','${st.cedula}', false, this)" class="att-btn absent ${isAbsent ? 'active' : ''}"><div class="att-circle"></div> Ausente</div>
            <div onclick="window.setAttendance('${res.groupName}','${escapeHtml(res.date)}','${st.cedula}', true, this)" class="att-btn present ${isPresent ? 'active' : ''}"><div class="att-circle"></div> Presente</div>
          </div>
        </div>`;
      });
    }
    html += '</div>';
    groupDiv.innerHTML = html;
    list.appendChild(groupDiv);
  }
}

export async function setAttendance(gn, d, ced, isPresent, btnElement) {
  const parent = btnElement.parentElement;
  parent.querySelectorAll('.att-btn').forEach(b => b.classList.remove('active'));
  btnElement.classList.add('active');
  const s = await getDocs(query(collection(_db, _RESERVATIONS_COLLECTION), where("date", "==", d), where("groupName", "==", gn), where("status", "==", "approved")));
  const b = writeBatch(_db);
  s.forEach(docSnap => {
    b.set(docSnap.ref, { attendanceDetail: { [ced]: isPresent } }, { merge: true });
  });
  await b.commit();
}

export async function executeRecurringBlock(e) {
  e.preventDefault();
  const startStr = document.getElementById('rec-start').value;
  const endStr = document.getElementById('rec-end').value;
  const action = document.getElementById('rec-action').value;
  const selectedCells = document.querySelectorAll('.matrix-cell.selected');
  if (selectedCells.length === 0) return alert("Seleccione bloques.");
  const blocks = [];
  selectedCells.forEach(c => blocks.push({ d: parseInt(c.dataset.day), h: parseInt(c.dataset.hour) }));
  const batch = writeBatch(_db);
  let count = 0;
  const startDate = new Date(startStr + 'T00:00:00');
  const endDate = new Date(endStr + 'T00:00:00');
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    const blocksForDay = blocks.filter(b => b.d === dayOfWeek);
    if (blocksForDay.length > 0) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${da}`;
      blocksForDay.forEach(b => {
        const ref = doc(_db, _RESERVATIONS_COLLECTION, `BLOCK_${dateStr}_${b.h}`);
        if (action === 'block') batch.set(ref, { date: dateStr, hour: b.h, status: 'blocked', userId: 'ADMIN', type: 'recurring', createdAt: serverTimestamp() });
        else batch.delete(ref);
        count++;
      });
    }
  }
  if (count > 490) return alert("Rango muy grande.");
  await batch.commit();
  alert(`Listo. ${count} bloques.`);
  document.getElementById('recurring-modal').classList.add('hidden');
}
