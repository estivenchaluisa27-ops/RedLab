/**
 * src/auth/auth.js — Listener de autenticación y setup de sesión
 * @module auth/auth
 */
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { escapeHtml } from '../utils/escape.js';
import { showView } from '../utils/dom.js';
import { alert as notifyAlert } from '../utils/notify.js';
import { clearGroupUtilsCache } from '../groups/group-utils.js';
import { startNotificationsListener } from '../notifications/history.js';
import { setSentryUser, clearSentryUser } from '../utils/sentry.js';
import { loadAdminDashboard } from '../courses/courses-list.js';
import { setupStudentView } from '../calendar/calendar.js';
import { goAdminSection } from '../admin-router-controller.js';
import { initPushNotifications } from '../notifications/push.js';

let unsubscribeAuth = null;

/**
 * Inicia el listener de estado de autenticación.
 * Guarda la referencia del unsubscribe para limpieza.
 * @param {FirebaseAuth} auth
 * @param {FirebaseFirestore} db
 * @param {object} state
 * @param {Function} resetState
 * @param {Function} setupSessionFn
 */
export function initAuthListener(auth, db, state, resetState, setupSessionFn) {
  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (user) {
      state.user = user;
      initPushNotifications();
      let adminSnap = null;
      let profSnap = null;
      let studentSnap = null;

      try {
        adminSnap = await getDoc(doc(db, "admins", user.email));
      } catch (error) {
        console.error("getDoc(admins) falló:", error.code, error.message);
      }
      try {
        profSnap = await getDoc(doc(db, "professors", user.email));
      } catch (error) {
        console.error("getDoc(professors) falló:", error.code, error.message);
      }
      try {
        studentSnap = await getDoc(doc(db, "student_directory", user.email));
      } catch (error) {
        console.error("getDoc(student_directory) falló:", error.code, error.message);
      }

      try {
        if (adminSnap && adminSnap.exists()) { setupSessionFn('admin', adminSnap.data(), null); return; }
        if (profSnap && profSnap.exists()) { setupSessionFn('professor', profSnap.data(), null); return; }
        if (studentSnap && studentSnap.exists()) { setupSessionFn('student', null, studentSnap.data()); return; }

        notifyAlert("Usuario no registrado."); await signOut(auth);
      } catch (error) {
        console.error("setupSession falló:", error.code, error.message);
        notifyAlert("Error de conexión al verificar tu perfil.");        await signOut(auth);
      }
    } else {
      resetState(); clearGroupUtilsCache(); clearSentryUser(); showView('login');
      const btn = document.getElementById('login-submit-btn');
      if (btn) { btn.disabled = false; btn.innerHTML = 'INGRESAR'; }
      // Limpiar query string y hash residuales de la URL (ej: /?#/admin/calendario)
      if (window.location.search || window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  });
}

/**
 * Detiene el listener de autenticación.
 */
export function unsubscribeAuthListener() {
  if (unsubscribeAuth) { unsubscribeAuth(); unsubscribeAuth = null; }
}

/**
 * Configura la sesión del usuario (rol, UI, carga datos).
 * @param {'admin'|'professor'|'student'} role
 * @param {object} userData
 * @param {object} studentData
 * @param {object} state
 * @param {FirebaseFirestore} db
 */
export async function setupSession(role, userData, studentData, state, db) {
  state.role = role;
  setSentryUser(state.user?.email || null);
  const headerEl = role === 'student' ? 'student-header-user-info' : 'admin-header-user-info';
  const nameEl = document.getElementById(headerEl);

  if (role === 'admin' || role === 'professor') {
    showView('admin');
    if (nameEl) nameEl.innerHTML = `<span class="font-bold">${escapeHtml(userData.name)}</span><span class="ml-2 text-xs bg-yellow-500 text-black px-2 rounded">${role.toUpperCase()}</span>`;
    loadAdminDashboard();
    // El router del admin decide la sección activa. Default: calendario.
    goAdminSection('calendario');
  } else if (role === 'student') {
    state.courseId = studentData.courseId;
    state.groupId = studentData.groupId;

    try {
      const [courseDoc, groupDoc] = await Promise.all([
        getDoc(doc(db, "courses", state.courseId)),
        getDoc(doc(db, "courses", state.courseId, "groups", state.groupId))
      ]);

      if (courseDoc.exists() && groupDoc.exists()) {
        const cData = courseDoc.data();
        const gData = groupDoc.data();

        state.groupName = gData.name;
        state.weeklyLimit = cData.weeklyLimit || 4;

        if (nameEl) nameEl.innerHTML = `<div class="text-right leading-tight"><div class="font-bold text-white text-sm">${escapeHtml(gData.name)}</div><div class="text-xs text-blue-200">${escapeHtml(state.user.email)}</div><span class="course-badge mt-1">${escapeHtml(cData.subject)} (${escapeHtml(cData.parallel)})</span></div><div class="ml-3 bg-white/10 p-2 rounded-full"><i class="fas fa-user text-white"></i></div>`;
        showView('student');
        setupStudentView();
        startNotificationsListener();
      }
    } catch (error) {
      console.error("Error cargando perfil:", error);
    }
  }
}
