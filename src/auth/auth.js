/**
 * src/auth/auth.js — Listener de autenticación y setup de sesión
 */
import { getDoc, doc, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { escapeHtml } from '../utils/escape.js';
import { showView } from '../utils/dom.js';

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
      try {
        const [adminSnap, profSnap, studentSnap] = await Promise.all([
          getDoc(doc(db, "admins", user.email)),
          getDoc(doc(db, "professors", user.email)),
          getDoc(doc(db, "student_directory", user.email))
        ]);

        if (adminSnap.exists()) { setupSessionFn('admin', adminSnap.data(), null); return; }
        if (profSnap.exists()) { setupSessionFn('professor', profSnap.data(), null); return; }
        if (studentSnap.exists()) { setupSessionFn('student', null, studentSnap.data()); return; }

        alert("Usuario no registrado."); await signOut(auth);
      } catch (error) {
        console.error(error);
        alert("Error de conexión al verificar tu perfil.");
        await signOut(auth);
      }
    } else {
      resetState(); showView('login');
      const btn = document.getElementById('login-submit-btn');
      if (btn) { btn.disabled = false; btn.innerHTML = 'INGRESAR'; }
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
  const headerEl = role === 'student' ? 'student-header-user-info' : 'admin-header-user-info';
  const nameEl = document.getElementById(headerEl);

  if (role === 'admin' || role === 'professor') {
    showView('admin');
    if (nameEl) nameEl.innerHTML = `<span class="font-bold">${escapeHtml(userData.name)}</span><span class="ml-2 text-xs bg-yellow-500 text-black px-2 rounded">${role.toUpperCase()}</span>`;
    // Temporal: función aún no extraída
    if (typeof window.loadAdminDashboard === 'function') window.loadAdminDashboard();
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
        // Temporal: función aún no extraída
        if (typeof window.setupStudentView === 'function') window.setupStudentView();
      }
    } catch (error) {
      console.error("Error cargando perfil:", error);
    }
  }
}
