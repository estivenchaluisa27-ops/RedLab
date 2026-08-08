import { collection, query, where, onSnapshot, getDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state } from '../state.js';
import { escapeHtml, escapeAttr } from '../utils/escape.js';
import { getWeekDays, formatDateYYYYMMDD, isPastDate } from '../utils/dates.js';
import { openAttendanceModal, batchBlockAction, deleteReservation } from '../reservations/reservations.js';

let _db = null;
let _RESERVATIONS_COLLECTION = null;
let _unsubscribeReservations = null;
let _unsubscribePending = null;

export function initCalendar(db, RESERVATIONS_COLLECTION) {
  _db = db;
  _RESERVATIONS_COLLECTION = RESERVATIONS_COLLECTION;
}

export function clearCalendarListeners() {
  if (_unsubscribeReservations) { _unsubscribeReservations(); _unsubscribeReservations = null; }
  if (_unsubscribePending) { _unsubscribePending(); _unsubscribePending = null; }
}

export function classifySlot(dateStr, hourStr, reservations, userState) {
  const past = isPastDate(dateStr, parseInt(hourStr));
  if (past) return { type: 'past', className: 'slot-past', label: 'Cerrado', disabled: true };

  const blocked = reservations.find(x => x.status === 'blocked');
  if (blocked) return { type: 'blocked', className: 'slot-blocked', label: 'Bloqueado', disabled: true };

  if (userState) {
    const mine = reservations.find(x => x.groupName === userState.groupName && x.status !== 'blocked');
    if (mine) {
      const isApproved = mine.status === 'approved';
      return {
        type: isApproved ? 'my-approved' : 'my-pending',
        className: isApproved ? 'slot-approved-self' : 'slot-pending',
        label: isApproved ? 'Agendado' : 'Pendiente',
        disabled: false,
        docId: mine.id
      };
    }
  }

  const uniqueApproved = new Set(reservations.filter(x => x.status === 'approved').map(x => x.groupName)).size;
  if (uniqueApproved >= 4) return { type: 'full', className: 'slot-full', label: 'Lleno', disabled: true };
  if (uniqueApproved > 0) return { type: 'partial', className: 'slot-partial', label: 'Disp.', disabled: false, occupancy: uniqueApproved };

  return { type: 'free', className: 'slot-free', label: 'Disponible', disabled: false };
}

function renderCalendarHeader(weekDays, headId) {
  const thead = document.getElementById(headId);
  if (!thead) return;
  thead.innerHTML = '';
  const hr = document.createElement('tr');
  const thHora = document.createElement('th');
  thHora.innerHTML = '<i class="far fa-clock text-slate-400 mr-2"></i>HORARIO';
  thHora.className = 'text-center bg-slate-100 w-24';
  hr.appendChild(thHora);
  weekDays.forEach(d => {
    const th = document.createElement('th');
    th.innerHTML = `<div class="flex flex-col leading-tight"><span class="text-lg font-bold text-slate-700">${d.toLocaleDateString('es-ES', {weekday:'long'})} ${d.getDate()}</span><span class="text-xs text-slate-500 font-medium uppercase mt-1">${d.toLocaleDateString('es-ES', {month:'long'})}</span></div>`;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
}

function handleAdminClick(e, btn) {
  if (state.selectedSlots.includes(btn.id)) {
    state.selectedSlots = state.selectedSlots.filter(x => x !== btn.id);
    btn.classList.remove('slot-selected');
  } else {
    state.selectedSlots.push(btn.id);
    btn.classList.add('slot-selected');
  }
  updateAdminActionBox();
}

export function updateAdminActionBox() {
  const box = document.getElementById('admin-action-box');
  const count = document.getElementById('admin-selection-count');
  if (state.selectedSlots.length > 0) {
    box.classList.remove('hidden');
    count.innerText = `${state.selectedSlots.length} seleccionados`;
  } else {
    box.classList.add('hidden');
  }
}

function renderAdminCalendar(weekDays) {
  renderCalendarHeader(weekDays, 'admin-calendar-head');
  const tbody = document.getElementById('admin-calendar-body');
  tbody.innerHTML = '';
  const slotMap = new Map();

  for (let h = 7; h <= 19; h++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><div class="time-cell-content">${h}:00 - ${h+1}:00</div></td>`;
    weekDays.forEach(d => {
      const id = `${formatDateYYYYMMDD(d)}_${h}`;
      const td = document.createElement('td');
      td.innerHTML = `<div class="slot-container"><button id="${id}" class="slot slot-free"></button></div>`;
      tr.appendChild(td);
      const btn = td.querySelector('button');
      btn.onclick = (e) => handleAdminClick(e, btn);
      slotMap.set(id, btn);
    });
    tbody.appendChild(tr);
  }

  if (_unsubscribeReservations) _unsubscribeReservations();
  _unsubscribeReservations = onSnapshot(
    query(collection(_db, _RESERVATIONS_COLLECTION),
      where("date", ">=", formatDateYYYYMMDD(weekDays[0])),
      where("date", "<=", formatDateYYYYMMDD(weekDays[4]))),
    (s) => {
      slotMap.forEach((b, k) => {
        const [dStr, hStr] = k.split('_');
        b.disabled = false;
        const container = b.parentElement;
        const oldInfo = container.querySelector('.info-btn');
        if (oldInfo) oldInfo.remove();
        if (isPastDate(dStr, parseInt(hStr))) {
          b.className = 'slot slot-past opacity-60';
          b.innerHTML = '<span class="text-xs">Cerrado</span>';
          b.dataset.status = 'past';
        } else {
          b.className = 'slot slot-free';
          b.innerHTML = '<span class="text-xs opacity-50">Disponible</span>';
          b.dataset.status = 'free';
        }
        if (state.selectedSlots.includes(k)) b.classList.add('slot-selected');
      });

      const map = new Map();
      s.forEach(d => {
        const k = `${d.data().date}_${d.data().hour}`;
        if (!map.has(k)) map.set(k, []);
        map.get(k).push({ id: d.id, ...d.data() });
      });

      map.forEach((arr, k) => {
        const b = slotMap.get(k);
        if (!b) return;
        const container = b.parentElement;
        const blocked = arr.find(x => x.status === 'blocked');
        const approved = arr.filter(x => x.status === 'approved').length;
        const pending = arr.filter(x => x.status === 'pending').length;
        const uniqueApprovedCount = new Set(arr.filter(x => x.status === 'approved').map(x => x.groupName)).size;

        if (approved > 0 || pending > 0 || (blocked && arr.length > 1)) {
          const infoBtn = document.createElement('div');
          infoBtn.className = 'info-btn';
          infoBtn.innerHTML = '<i class="fas fa-eye"></i>';
          infoBtn.onclick = (e) => { e.stopPropagation(); openAttendanceModal(k.split('_')[0], k.split('_')[1], arr); };
          container.appendChild(infoBtn);
        }

        if (blocked) {
          b.className = 'slot slot-blocked slot-admin-has-data';
          b.innerHTML = '<span>Bloqueado</span>';
          b.dataset.status = 'blocked';
        } else if (uniqueApprovedCount > 0) {
          b.className = `slot slot-admin-has-data ${uniqueApprovedCount >= 4 ? 'slot-full' : 'slot-partial'}`;
          b.innerHTML = `<span>Ocupado</span><div class="occupancy-badge">${uniqueApprovedCount}/4</div>` + (pending ? `<span class="text-xs text-yellow-700 font-bold mt-1">Espera: ${pending}</span>` : '');
          b.dataset.status = 'has-data';
        } else if (pending > 0) {
          b.className = 'slot slot-pending';
          b.innerHTML = `<span>Solicitudes: ${pending}</span>`;
        }

        if (state.selectedSlots.includes(k)) b.classList.add('slot-selected');
      });
    }
  );
}

function renderMatrix() {
  const container = document.getElementById('matrix-container');
  if (!container) return;
  container.innerHTML = `<div class="grid-matrix mb-4"><div></div><div class="matrix-header">Lun</div><div class="matrix-header">Mar</div><div class="matrix-header">Mié</div><div class="matrix-header">Jue</div><div class="matrix-header">Vie</div>${[7,8,9,10,11,12,13,14,15,16,17,18,19].map(h => `<div class="matrix-time">${h}:00</div>${[1,2,3,4,5].map(d => `<div class="matrix-cell" data-action="toggle-matrix-cell" data-day="${d}" data-hour="${h}"></div>`).join('')}`).join('')}</div>`;
}

function listenAdminPending() {
  if (_unsubscribePending) _unsubscribePending();

  _unsubscribePending = onSnapshot(
    query(collection(_db, _RESERVATIONS_COLLECTION), where("status", "==", "pending")),
    async (s) => {
      const c = document.getElementById('admin-requests-list');
      if (!c) return;
      c.innerHTML = '';

      if (s.empty) {
        c.innerHTML = '<div class="text-center p-4 text-slate-400 italic">No hay solicitudes</div>';
        return;
      }

      const reqs = [];
      s.forEach(d => reqs.push({ id: d.id, ...d.data() }));
      reqs.sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));

      for (const r of reqs) {
        let profName = "Cargando...";
        let profEmail = null;

        if (r.courseId) {
          if (state.coursesCache[r.courseId]) {
            profEmail = state.coursesCache[r.courseId].professorEmail;
          } else {
            try {
              const cSnap = await getDoc(doc(_db, "courses", r.courseId));
              if (cSnap.exists()) {
                state.coursesCache[r.courseId] = cSnap.data();
                profEmail = cSnap.data().professorEmail;
              } else {
                profName = "Curso Eliminado / Datos Antiguos";
              }
            } catch (e) { console.error("Error curso", e); }
          }
        }

        if (profEmail) {
          if (state.professorsCache[profEmail]) {
            profName = state.professorsCache[profEmail];
          } else {
            try {
              const pSnap = await getDoc(doc(_db, "professors", profEmail));
              if (pSnap.exists()) {
                profName = pSnap.data().name;
              } else {
                profName = profEmail;
              }
              state.professorsCache[profEmail] = profName;
            } catch (e) { console.error("Error profe", e); }
          }
        }

        const el = document.createElement('div');
        el.className = 'bg-white p-3 rounded-lg shadow-sm border border-slate-200 mb-2 flex justify-between items-center fade-in';
        el.innerHTML = `
        <div>
            <div class="font-bold text-sm text-slate-700">${escapeHtml(r.groupName)}</div>
            <div class="text-xs text-slate-500">${escapeHtml(r.date)} ${r.hour}:00</div>
            <div class="text-[13px] text-blue-600 font-bold mt-1">
                <i class="fas fa-chalkboard-teacher mr-1"></i>${escapeHtml(profName)}
            </div>
        </div>
        <div class="flex gap-2">
            <button data-action="adm-act" data-id="${r.id}" data-app="true" data-date="${escapeAttr(r.date)}" data-hour="${r.hour}" data-group="${escapeAttr(r.groupName)}" class="w-8 h-8 flex items-center justify-center rounded-full bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 transition"><i class="fas fa-check"></i></button>
            <button data-action="reject-req" data-id="${r.id}" class="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition"><i class="fas fa-times"></i></button>
        </div>`;
        c.appendChild(el);
      }
    }
  );
}

export function setupAdminCalendarLogic() {
  clearCalendarListeners();
  const update = () => { const w = getWeekDays(state.weekOffset); renderAdminCalendar(w); };
  document.getElementById('admin-prev-week').onclick = () => { state.weekOffset--; state.selectedSlots = []; update(); updateAdminActionBox(); };
  document.getElementById('admin-next-week').onclick = () => { state.weekOffset++; state.selectedSlots = []; update(); updateAdminActionBox(); };
  document.getElementById('admin-block-btn').onclick = () => batchBlockAction('block');
  document.getElementById('admin-unblock-btn').onclick = () => batchBlockAction('unblock');
  renderMatrix();
  update();
  listenAdminPending();
}

function handleStudentClick(btn) {
  if (btn.disabled) return;
  const id = btn.id;
  const st = btn.dataset.status || '';
  if (st.includes('my')) {
    Swal.fire({
      title: '¿Cancelar tu reserva?',
      text: "Liberarás este horario y otro grupo podrá tomarlo.",
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, cancelar turno',
      cancelButtonText: 'Mantener turno'
    }).then((result) => {
      if (result.isConfirmed) deleteReservation(btn.dataset.docId);
    });
    return;
  }
  if (state.selectedSlots.includes(id)) {
    state.selectedSlots = state.selectedSlots.filter(x => x !== id);
    btn.classList.remove('slot-selected');
  } else {
    state.selectedSlots.push(id);
    btn.classList.add('slot-selected');
  }
  updateStudentUI();
}

export function updateStudentUI() {
  const b = document.getElementById('student-request-box');
  const txt = document.getElementById('student-request-count');
  const btn = document.getElementById('submit-request-btn');
  if (b && txt && btn) {
    if (state.selectedSlots.length > 0) {
      b.classList.remove('hidden');
      txt.innerText = `${state.selectedSlots.length} hora(s)`;
      btn.disabled = false;
    } else {
      b.classList.add('hidden');
      btn.disabled = true;
    }
  }
}

function renderStudentCalendar(weekDays) {
  renderCalendarHeader(weekDays, 'student-calendar-head');
  const tbody = document.getElementById('student-calendar-body');
  tbody.innerHTML = '';
  const map = new Map();

  for (let h = 7; h <= 19; h++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><div class="time-cell-content">${h}:00 - ${h+1}:00</div></td>`;
    weekDays.forEach(d => {
      const id = `${formatDateYYYYMMDD(d)}_${h}`;
      const td = document.createElement('td');
      td.innerHTML = `<div class="slot-container"><button id="${id}" class="slot slot-free"><span class="opacity-50">Disponible</span></button></div>`;
      tr.appendChild(td);
      const btn = td.querySelector('button');
      btn.onclick = () => handleStudentClick(btn);
      map.set(id, btn);
    });
    tbody.appendChild(tr);
  }

  if (_unsubscribeReservations) _unsubscribeReservations();
  _unsubscribeReservations = onSnapshot(
    query(collection(_db, _RESERVATIONS_COLLECTION),
      where("date", ">=", formatDateYYYYMMDD(weekDays[0])),
      where("date", "<=", formatDateYYYYMMDD(weekDays[4]))),
    (s) => {
      map.forEach((b, k) => {
        const [dStr, hStr] = k.split('_');
        if (isPastDate(dStr, parseInt(hStr))) {
          b.className = 'slot slot-past opacity-50';
          b.innerHTML = '<span class="text-xs">No Disp.</span>';
          b.dataset.status = 'past';
          b.disabled = true;
        } else {
          b.className = 'slot slot-free';
          b.innerHTML = '<span class="opacity-50">Disponible</span>';
          b.dataset.status = 'free';
          b.disabled = false;
        }
      });

      const groups = new Map();
      s.forEach(d => {
        const k = `${d.data().date}_${d.data().hour}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push({ id: d.id, ...d.data() });
      });

      groups.forEach((arr, k) => {
        const b = map.get(k);
        if (!b || b.dataset.status === 'past') return;
        const [dStr, hStr] = k.split('_');
        const result = classifySlot(dStr, hStr, arr, state);
        if (result.type === 'blocked') {
          b.className = 'slot slot-blocked';
          b.innerHTML = '<span>No disp.</span>';
          b.dataset.status = 'blocked';
          b.disabled = true;
        } else if (result.type === 'my-approved' || result.type === 'my-pending') {
          b.className = `slot ${result.className}`;
          b.innerHTML = `<span>${result.label}</span>`;
          b.dataset.status = `my-${mineStatus(result.type)}`;
          b.dataset.docId = result.docId;
        } else if (result.type === 'full') {
          b.className = 'slot slot-full';
          b.innerHTML = '<span>Lleno</span>';
          b.dataset.status = 'full';
          b.disabled = true;
        } else if (result.type === 'partial') {
          b.className = 'slot slot-partial';
          b.innerHTML = `<span>Disp.</span><div class="occupancy-badge">${result.occupancy}/4</div>`;
          b.dataset.status = 'partial';
        }
      });

      state.selectedSlots.forEach(id => {
        const b = map.get(id);
        if (b && !b.disabled) {
          b.classList.add('slot-selected');
          b.innerHTML = '<span><i class="fas fa-check mb-1"></i><br>Selecc.</span>';
        }
      });
      updateStudentUI();
    }
  );
}

function mineStatus(type) {
  return type === 'my-approved' ? 'approved' : 'pending';
}

export function setupStudentView() {
  clearCalendarListeners();
  const update = () => { const w = getWeekDays(state.weekOffset); renderStudentCalendar(w); };
  document.getElementById('student-prev-week').onclick = () => { state.weekOffset--; state.selectedSlots = []; update(); };
  document.getElementById('student-next-week').onclick = () => { state.weekOffset++; state.selectedSlots = []; update(); };
  update();
}

export function switchTab(tab) {
  document.getElementById('tab-calendar').classList.add('hidden');
  document.getElementById('tab-courses').classList.add('hidden');
  document.getElementById('tab-btn-cal').classList.remove('border-[#004274]', 'text-[#004274]');
  document.getElementById('tab-btn-cou').classList.remove('border-[#004274]', 'text-[#004274]');
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  const btn = tab === 'calendar' ? 'tab-btn-cal' : 'tab-btn-cou';
  document.getElementById(btn).classList.add('border-[#004274]', 'text-[#004274]');
}
