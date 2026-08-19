/**
 * src/notifications/history.js — Historial in-app de notificaciones del estudiante
 * @module notifications/history
 */
import { collection, query, where, orderBy, limit, onSnapshot, getDocs, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHtml } from '../utils/escape.js';
import { alert as notifyAlert } from '../utils/notify.js';

let _db = null;
let _state = null;
let _unsubscribe = null;

const TYPE_META = {
  solicitada: { icon: 'fa-clock', color: 'bg-blue-100 text-blue-700', label: 'Solicitud enviada' },
  aprobada: { icon: 'fa-check-circle', color: 'bg-green-100 text-green-700', label: 'Turno aprobado' },
  rechazada: { icon: 'fa-times-circle', color: 'bg-red-100 text-red-700', label: 'Turno rechazado' },
  cancelada: { icon: 'fa-ban', color: 'bg-slate-100 text-slate-600', label: 'Turno cancelado' },
  bloqueada: { icon: 'fa-lock', color: 'bg-amber-100 text-amber-700', label: 'Bloqueo de horario' },
};

/**
 * Construye el documento de notificación que se añade junto a la operación
 * de reserva dentro del mismo batch (atómico con la reserva).
 */
export function buildNotificationData({ userId, type, date, hour, courseId = null, groupName = null }) {
  return {
    userId, type, date,
    hour: typeof hour === 'number' ? hour : parseInt(hour),
    courseId: courseId || null,
    groupName: groupName || null,
    read: false,
    createdAt: serverTimestamp()
  };
}

export function initNotifications(db, state) {
  _db = db;
  _state = state;
}

export function startNotificationsListener() {
  if (!_db || !_state?.user?.uid || _unsubscribe) return;
  const q = query(collection(_db, 'notifications'), where('userId', '==', _state.user.uid), orderBy('createdAt', 'desc'), limit(100));
  _unsubscribe = onSnapshot(q, (snap) => {
    renderBadge(snap);
    if (!document.getElementById('notifications-modal')?.classList.contains('hidden')) renderList(snap);
  }, (error) => {
    console.error('Error cargando notificaciones:', error);
  });
}

export function stopNotificationsListener() {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
}

export async function openNotificationsModal() {
  const modal = document.getElementById('notifications-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  try {
    const q = query(collection(_db, 'notifications'), where('userId', '==', _state.user.uid), orderBy('createdAt', 'desc'), limit(100));
    const snap = await getDocs(q);
    renderList(snap);
    await markAllAsRead(snap);
  } catch (error) {
    console.error('Error cargando notificaciones:', error);
    notifyAlert("Error al cargar las notificaciones: " + error.message);
  }
}

async function markAllAsRead(snap) {
  const unread = snap.docs.filter(d => d.data().read !== true);
  if (unread.length === 0) return;
  const batch = writeBatch(_db);
  unread.forEach(d => batch.update(d.ref, { read: true }));
  await batch.commit();
  const badge = document.getElementById('notif-badge');
  if (badge) { badge.classList.add('hidden'); badge.textContent = ''; }
}

function renderBadge(snap) {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  const unread = snap.docs.filter(d => d.data().read !== true).length;
  if (unread === 0) {
    badge.classList.add('hidden');
    badge.textContent = '';
  } else {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.remove('hidden');
  }
}

function renderList(snap) {
  const list = document.getElementById('notifications-list');
  if (!list) return;
  if (snap.docs.length === 0) {
    list.innerHTML = '<div class="text-center text-slate-400 py-10"><i class="fas fa-bell-slash text-3xl mb-2"></i><p class="text-sm">Sin notificaciones todavía</p></div>';
    return;
  }
  list.innerHTML = snap.docs.map((d) => {
    const n = d.data();
    const meta = TYPE_META[n.type] || { icon: 'fa-bell', color: 'bg-slate-100 text-slate-600', label: 'Notificación' };
    return `<div class="flex items-start gap-3 bg-white p-3 rounded-lg shadow-sm border border-slate-100">
      <div class="mt-0.5 w-8 h-8 rounded-full ${meta.color} flex items-center justify-center shrink-0"><i class="fas ${meta.icon} text-sm"></i></div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold text-slate-800">${escapeHtml(meta.label)}</p>
        <p class="text-xs text-slate-500">${escapeHtml(n.groupName || 'Laboratorio')} · ${escapeHtml(formatSlot(n.date, n.hour))}</p>
        <p class="text-[11px] text-slate-400 mt-0.5">${escapeHtml(relativeTime(n.createdAt))}</p>
      </div>
      ${n.read === true ? '' : '<span class="mt-1 w-2 h-2 rounded-full bg-red-500 shrink-0"></span>'}
    </div>`;
  }).join('');
}

function formatSlot(date, hour) {
  let label = date;
  try {
    label = new Date(date + 'T00:00:00').toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch (e) { /* fallback al valor crudo */ }
  return `${label} · ${String(hour).padStart(2, '0')}:00`;
}

function relativeTime(ts) {
  if (!ts) return '';
  const then = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - then.getTime();
  if (diff < 60000) return 'Ahora';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} d`;
}