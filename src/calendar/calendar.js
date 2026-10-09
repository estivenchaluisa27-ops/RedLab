import { collection, query, where, onSnapshot, getDoc, doc } from '../firebase-config.js';
import { state, registerListener, unregisterListener } from '../state.js';
import { DEFAULTS } from '../settings/lab-config.js';
import { escapeHtml, escapeAttr } from '../utils/escape.js';
import { getWeekDays, formatDateYYYYMMDD, isPastDate } from '../utils/dates.js';
import { openAttendanceModal, deleteReservation } from '../reservations/reservations.js';
import { initStudentDayView, syncStudentDayView } from './student-day-view.js';
import { coverPattern } from '../utils/cover-pattern.js';

let _db = null;
let _RESERVATIONS_COLLECTION = null;

const _adminSlotDetails = new Map();

export function openAdminSlotInfo(dateStr, hourStr) {
  openAttendanceModal(dateStr, hourStr, _adminSlotDetails.get(`${dateStr}_${hourStr}`) || []);
}

export function initCalendar(db, RESERVATIONS_COLLECTION) {
  _db = db;
  _RESERVATIONS_COLLECTION = RESERVATIONS_COLLECTION;
}

export function clearCalendarListeners() {
  unregisterListener('calendar:reservations');
  unregisterListener('calendar:pending');
  unregisterListener('calendar:student-blocked');
  unregisterListener('calendar:student-course');
  _adminSlotDetails.clear();
}

/**
 * Clasifica un slot según reservas y usuario.
 * Sin `capacity` usa el default móvil (DEFAULTS.slotCapacity = 4): la
 * vista-día inyecta la capacidad de la config como 5.º arg cuando está
 * disponible (state.labConfig) y cae al default si no.
 * El path escritorio/admin inyecta la capacidad de la config como 5.º arg.
 */
export function classifySlot(dateStr, hourStr, reservations, userState, capacity) {
  const cap = capacity ?? DEFAULTS.slotCapacity;
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
  if (uniqueApproved >= cap) return { type: 'full', className: 'slot-full', label: 'Lleno', disabled: true };
  if (uniqueApproved > 0) return { type: 'partial', className: 'slot-partial', label: 'Disp.', disabled: false, occupancy: uniqueApproved };

  return { type: 'free', className: 'slot-free', label: 'Disponible', disabled: false };
}

function renderCalendarHeader(weekDays, headId) {
  const thead = document.getElementById(headId);
  if (!thead) return;
  thead.innerHTML = '';
  const hr = document.createElement('tr');
  const thHora = document.createElement('th');
  thHora.innerHTML = '<i class="far fa-clock text-slate-400"></i>';
  thHora.className = 'text-center bg-slate-100 w-24 max-sm:w-10';
  hr.appendChild(thHora);
  weekDays.forEach(d => {
    const th = document.createElement('th');
    th.innerHTML = `<div class="flex flex-col leading-tight"><span class="text-lg font-bold text-slate-700"><span class="day-full">${d.toLocaleDateString('es-ES', {weekday:'long'})} ${d.getDate()}</span><span class="day-abbr">${d.toLocaleDateString('es-ES', {weekday:'short'}).replace(/\./g, '')} ${d.getDate()}</span></span></div>`;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
}

export function handleAdminClick(e, btn) {
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
  const startHour = state.labConfig?.startHour ?? DEFAULTS.startHour;
  const endHour = state.labConfig?.endHour ?? DEFAULTS.endHour;
  const capacity = state.labConfig?.slotCapacity ?? DEFAULTS.slotCapacity;

  for (let h = startHour; h <= endHour; h++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><div class="time-cell-content"><span class="time-cell-full">${h}:00 - ${h+1}:00</span><span class="time-cell-compact">${h}h</span></div></td>`;
    weekDays.forEach(d => {
      const id = `${formatDateYYYYMMDD(d)}_${h}`;
      const slotPast = isPastDate(formatDateYYYYMMDD(d), h);
      const slotClass = slotPast ? 'slot-past' : 'slot-free';
      const td = document.createElement('td');
      td.innerHTML = `<div class="slot-container"><button id="${escapeAttr(id)}" class="slot ${slotClass}" data-action="admin-slot-toggle"></button></div>`;
      tr.appendChild(td);
      const btn = td.querySelector('button');
      slotMap.set(id, btn);
    });
    tbody.appendChild(tr);
  }

  registerListener('calendar:reservations', onSnapshot(
    query(collection(_db, _RESERVATIONS_COLLECTION),
      where("date", ">=", formatDateYYYYMMDD(weekDays[0])),
      where("date", "<=", formatDateYYYYMMDD(weekDays[weekDays.length - 1]))),
    (s) => {
      _adminSlotDetails.clear();
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
        _adminSlotDetails.set(k, arr);
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
          infoBtn.dataset.action = 'open-slot-info';
          infoBtn.dataset.date = k.split('_')[0];
          infoBtn.dataset.hour = k.split('_')[1];
          container.appendChild(infoBtn);
        }

        if (blocked) {
          b.className = 'slot slot-blocked slot-admin-has-data';
          b.innerHTML = '<span>Bloqueado</span>';
          b.dataset.status = 'blocked';
        } else if (uniqueApprovedCount > 0) {
          b.className = `slot slot-admin-has-data ${uniqueApprovedCount >= capacity ? 'slot-full' : 'slot-partial'}`;
          b.innerHTML = `<span>Ocupado</span><div class="occupancy-badge">${uniqueApprovedCount}/${capacity}</div>` + (pending ? `<span class="text-xs text-yellow-700 font-bold mt-1">Espera: ${pending}</span>` : '');
          b.dataset.status = 'has-data';
        } else if (pending > 0) {
          b.className = 'slot slot-pending';
          b.innerHTML = `<span>Solicitudes: ${pending}</span>`;
        }

        if (state.selectedSlots.includes(k)) b.classList.add('slot-selected');
      });
    }
  ));
}

function renderMatrix() {
  const container = document.getElementById('matrix-container');
  if (!container) return;
  const startHour = state.labConfig?.startHour ?? DEFAULTS.startHour;
  const endHour = state.labConfig?.endHour ?? DEFAULTS.endHour;
  const matrixDays = state.labConfig?.weekDays ?? DEFAULTS.weekDays;
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const hours = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);
  container.innerHTML = `<div class="grid-matrix mb-4"><div></div>${matrixDays.map(d => `<div class="matrix-header">${dayNames[d]}</div>`).join('')}${hours.map(h => `<div class="matrix-time">${h}:00</div>${matrixDays.map(d => `<div class="matrix-cell" data-action="toggle-matrix-cell" data-day="${d}" data-hour="${h}"></div>`).join('')}`).join('')}</div>`;
}

function listenAdminPending() {
  registerListener('calendar:pending', onSnapshot(
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

      // Precarga paralela: cursos y profesores faltantes en una sola pasada
      const missingCourses = [...new Set(reqs.map(r => r.courseId).filter(c => c && !(c in state.coursesCache)))];
      await Promise.all(missingCourses.map(async (courseId) => {
        try {
          const cSnap = await getDoc(doc(_db, "courses", courseId));
          state.coursesCache[courseId] = cSnap.exists() ? cSnap.data() : null;
        } catch (e) { console.error("Error curso", e); }
      }));

      const missingProfs = [...new Set(reqs
        .map(r => state.coursesCache[r.courseId]?.professorEmail)
        .filter(e => e && !(e in state.professorsCache)))];
      await Promise.all(missingProfs.map(async (email) => {
        try {
          const pSnap = await getDoc(doc(_db, "professors", email));
          state.professorsCache[email] = pSnap.exists() ? pSnap.data().name : email;
        } catch (e) { console.error("Error profe", e); }
      }));

      for (const r of reqs) {
        let profName = "Cargando...";
        const course = r.courseId ? state.coursesCache[r.courseId] : null;
        if (r.courseId && course === null) {
          profName = "Curso Eliminado / Datos Antiguos";
        } else if (course?.professorEmail) {
          profName = state.professorsCache[course.professorEmail] || course.professorEmail;
        }

        const el = document.createElement('div');
        el.className = 'bg-white p-3 rounded-[2px] border border-slate-200 card-lift mb-2 flex justify-between items-center fade-in';
        el.innerHTML = `
        <div>
            <div class="font-bold text-sm text-slate-700">${escapeHtml(r.groupName)}</div>
            <div class="text-xs text-slate-500">${escapeHtml(r.date)} ${r.hour}:00</div>
            <div class="text-[13px] text-uce-600 font-bold mt-1">
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
  ));
}

export function refreshAdminCalendar() {
  // Path escritorio/admin: la semana se filtra por los días hábiles de config.
  const weekDays = state.labConfig?.weekDays ?? DEFAULTS.weekDays;
  const w = getWeekDays(state.weekOffset, weekDays);
  renderAdminCalendar(w);
}

export function setupAdminCalendarLogic() {
  clearCalendarListeners();
  document.getElementById('admin-prev-week').dataset.action = 'admin-prev-week';
  document.getElementById('admin-next-week').dataset.action = 'admin-next-week';
  document.getElementById('admin-block-btn').dataset.action = 'admin-block';
  document.getElementById('admin-unblock-btn').dataset.action = 'admin-unblock';
  renderMatrix();
  refreshAdminCalendar();
  listenAdminPending();
}

export function handleStudentClick(btn) {
  if (btn.disabled) return;
  const id = btn.id;
  const st = btn.dataset.status || '';
  if (st.includes('my')) {
    const isApproved = st === 'my-approved';
    Swal.fire({
      title: isApproved ? '¿Cancelar tu turno aprobado?' : '¿Cancelar tu reserva?',
      text: isApproved
        ? "Este turno ya fue confirmado. Al cancelarlo liberarás el horario y otro grupo podrá tomarlo."
        : "Liberarás este horario y otro grupo podrá tomarlo.",
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
  // Banda decorativa: mismo generador de portadas de los cursos
  // (cover-pattern.js), semilla fija para un patrón estable.
  const cover = document.getElementById('student-request-cover');
  if (cover && !cover.dataset.ready) {
    cover.style.backgroundImage = coverPattern('resumen', 2);
    cover.dataset.ready = '1';
  }
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
  // Tabla semanal de estudiante = vista de escritorio (hidden md:table en
  // index.html): horario parametrizado. La vista-día móvil no pasa por aquí
  // (usa sus propias constantes FIRST/LAST_HOUR en student-day-view.js).
  const startHour = state.labConfig?.startHour ?? DEFAULTS.startHour;
  const endHour = state.labConfig?.endHour ?? DEFAULTS.endHour;

  for (let h = startHour; h <= endHour; h++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><div class="time-cell-content"><span class="time-cell-full">${h}:00 - ${h+1}:00</span><span class="time-cell-compact">${h}h</span></div></td>`;
    weekDays.forEach(d => {
      const id = `${formatDateYYYYMMDD(d)}_${h}`;
      const slotPast = isPastDate(formatDateYYYYMMDD(d), h);
      const slotClass = slotPast ? 'slot-past' : 'slot-free';
      const slotLabel = slotPast ? 'Cerrado' : 'Disponible';
      const td = document.createElement('td');
      td.innerHTML = `<div class="slot-container"><button id="${escapeAttr(id)}" class="slot ${slotClass}" data-action="student-slot-toggle"><span class="opacity-50">${slotLabel}</span></button></div>`;
      tr.appendChild(td);
      const btn = td.querySelector('button');
      map.set(id, btn);
    });
    tbody.appendChild(tr);
  }

  const blockedDocs = new Map();
  const courseDocs = new Map();

  // Vista-día móvil: shell inmediato con la semana (skeleton hasta que
  // lleguen los snapshots); las queries y classifySlot no cambian.
  syncStudentDayView(weekDays, null, classifySlot);

  const mergeAndRender = (map) => {
    const merged = new Map();
    for (const [id, data] of blockedDocs) merged.set(id, data);
    for (const [id, data] of courseDocs) merged.set(id, data);
    const docsArray = Array.from(merged.values());
    renderStudentSlots(map, docsArray);
    // Alimenta la vista-día con la semana + cache de docs (cero re-suscripción).
    syncStudentDayView(weekDays, docsArray, classifySlot);
  };

  registerListener('calendar:student-blocked', onSnapshot(
    query(collection(_db, _RESERVATIONS_COLLECTION),
      where("status", "==", "blocked"),
      where("date", ">=", formatDateYYYYMMDD(weekDays[0])),
      where("date", "<=", formatDateYYYYMMDD(weekDays[weekDays.length - 1]))),
    (s) => {
      blockedDocs.clear();
      s.forEach(d => blockedDocs.set(d.id, { id: d.id, ...d.data() }));
      mergeAndRender(map);
    },
    (error) => {
      console.error('Error en listener de bloqueados:', error);
      mergeAndRender(map);
    }
  ));

  registerListener('calendar:student-course', onSnapshot(
    query(collection(_db, _RESERVATIONS_COLLECTION),
      where("courseId", "==", state.courseId),
      where("date", ">=", formatDateYYYYMMDD(weekDays[0])),
      where("date", "<=", formatDateYYYYMMDD(weekDays[weekDays.length - 1]))),
    (s) => {
      courseDocs.clear();
      s.forEach(d => courseDocs.set(d.id, { id: d.id, ...d.data() }));
      mergeAndRender(map);
    },
    (error) => {
      console.error('Error en listener de curso:', error);
      mergeAndRender(map);
    }
  ));
}

function renderStudentSlots(map, docsArray) {
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
  docsArray.forEach(d => {
    const k = `${d.date}_${d.hour}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  });

  groups.forEach((arr, k) => {
    const b = map.get(k);
    if (!b || b.dataset.status === 'past') return;
    const [dStr, hStr] = k.split('_');
    // Path escritorio: la config se inyecta como argumento (la vista-día
    // móvil llama a classifySlot con 4 args y usa defaults).
    const cap = state.labConfig?.slotCapacity ?? DEFAULTS.slotCapacity;
    const result = classifySlot(dStr, hStr, arr, state, cap);
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
      b.innerHTML = `<span>Disp.</span><div class="occupancy-badge">${result.occupancy}/${cap}</div>`;
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

function mineStatus(type) {
  return type === 'my-approved' ? 'approved' : 'pending';
}

export function refreshStudentCalendar() {
  const w = getWeekDays(state.weekOffset);
  renderStudentCalendar(w);
}

export function setupStudentView() {
  clearCalendarListeners();
  document.getElementById('student-prev-week').dataset.action = 'student-prev-week';
  document.getElementById('student-next-week').dataset.action = 'student-next-week';
  initStudentDayView({ onWeekJump: refreshStudentCalendar });
  refreshStudentCalendar();
}
