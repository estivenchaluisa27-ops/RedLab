/**
 * src/main.js — Punto de entrada de la aplicación
 * Inicializa infraestructura y maneja event delegation para data-action handlers.
 */
import { initFirebase, RESERVATIONS_COLLECTION } from './firebase-config.js';
import { state, resetState } from './state.js';
import { initAuthListener as _initAuthListener, setupSession as _setupSession } from './auth/auth.js';
import { sendResetLink, handleChangePassword } from './auth/auth-ui.js';
import { bindLoginView } from './views/login-view.js';
import { initCoursesList } from './courses/courses-list.js';
import { initCourses, setupEditCourseView } from './courses/courses.js';
import { initGroups, setupCourseGroupsView, clearGroupsListener } from './groups/groups.js';
import { initGroupDetails, setupGroupDetailsView, destroyGroupDetailsView } from './groups/group-details.js';
import { initReservations, submitReservation } from './reservations/reservations.js';
import { initNotifications } from './notifications/history.js';
import { initReports, setupReportesView } from './reports/reports.js';
import { setupMetricasView } from './metrics/metrics-view.js';
import { initCalendar, setupAdminCalendarLogic, updateAdminActionBox, updateStudentUI } from './calendar/calendar.js';
import { initMotionObserver, handlePress } from './utils/motion.js';
import { initSentry } from './utils/sentry.js';
import { createSubmitDispatcher } from './utils/dispatcher.js';
import { initAdminRouter, registerSectionSetup, registerSubviewSetup, registerSubviewOnLeave } from './admin-router-controller.js';
import { createClickActions, createSubmitActions } from './actions.js';
import { showView } from './utils/dom.js';
// P-A core escritorio: paneles Usuarios/Ajustes + parametrización config/lab.
// Solo-escritorio; no altera el init móvil (se añade después, sin reordenar).
import { setupUsuariosView, handleSaveAdmin, handleSaveProfessor, handleCSVImport, handleMoveStudent } from './users/users.js';
import { initUsuarios } from './users/users-store.js';
import { loadLabConfig } from './settings/lab-config.js';
import { setupAjustesView, saveLabConfig } from './settings/settings.js';

document.addEventListener('DOMContentLoaded', async () => {
  initSentry();
  initMotionObserver();
  document.addEventListener('pointerdown', handlePress, true);

  let db, auth;
  try {
    ({ db, auth } = await initFirebase());
  } catch (err) {
    // Sin Firebase no hay nada que montar. El login ya esta visible (es la vista
    // de arranque), asi que solo hace falta registrar el fallo.
    console.error('[boot] initFirebase fallo:', err);
    showView('login');
    return;
  }

  initCoursesList(db, state);
  initCourses(db, state);
  initGroups(db, state);
  initGroupDetails(db, state);
  initReservations(db, state, RESERVATIONS_COLLECTION, { updateAdminActionBox, updateStudentUI });
  initReports(db, state);
  initCalendar(db, RESERVATIONS_COLLECTION);
  initNotifications(db, state);
  // P-A: init solo-escritorio después del init móvil (sin reordenarlo).
  initUsuarios(db, state);

  // P-A: cargar config del laboratorio antes de cualquier setup de sección.
  // No bloquea el boot: la vista-día móvil (init diferido en setupStudentView)
  // arranca igual con DEFAULTS si la lectura aún no resolvió.
  loadLabConfig(db).then(cfg => { state.labConfig = cfg; }).catch(() => { state.labConfig = null; });

  // Router admin — registro de setups por sección y sub-vista
  registerSectionSetup('calendario', () => setupAdminCalendarLogic(), { rerunOnEveryEnter: true });
  registerSectionSetup('cursos', () => { /* la sub-view activa decide setup, ver registerSubviewSetup */ });
  registerSectionSetup('usuarios', () => setupUsuariosView(db, state));
  registerSectionSetup('ajustes', () => setupAjustesView());
  registerSectionSetup('reportes', () => setupReportesView(), { rerunOnEveryEnter: true });
  registerSectionSetup('metricas', () => setupMetricasView(db, state), { rerunOnEveryEnter: true });

  // Sub-vistas de cursos: setup se invoca al montar cada sub-view
  registerSubviewSetup('curso-nuevo', () => { /* form vacío por defecto; no requiere setup adicional */ });
  registerSubviewSetup('curso-editar', (params) => setupEditCourseView(params));
  registerSubviewSetup('curso-grupos', (params) => setupCourseGroupsView(params));
  registerSubviewSetup('grupo-detalle', (params) => setupGroupDetailsView(params));

  // onLeave: limpiar el listener de grupos al salir de curso-grupos
  registerSubviewOnLeave('curso-grupos', () => clearGroupsListener());
  // onLeave: destruir el MemberGrid al salir de grupo-detalle (limpia listeners)
  registerSubviewOnLeave('grupo-detalle', () => destroyGroupDetailsView());

  bindLoginView(auth);

  // Event delegation — los mapas de data-action viven en src/actions.js
  const clickActions = createClickActions({ auth });
  const baseSubmitActions = createSubmitActions({ auth });
  // P-A: handlers solo-escritorio (Usuarios/Ajustes). Se fusionan sin
  // modificar actions.js ni los handlers móviles existentes.
  const submitActions = {
    ...baseSubmitActions,
    'save-admin': (e) => handleSaveAdmin(e),
    'save-professor': (e) => handleSaveProfessor(e),
    'submit-csv-import': (e) => handleCSVImport(e),
    'submit-move-student': (e) => handleMoveStudent(e),
    'save-lab-config': (e) => saveLabConfig(e, db),
  };

  // El dispatcher reenvía el evento como 2º arg: las actions que solo usan el
  // botón lo ignoran; 'open-slot-info' lo necesita para stopPropagation().
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const handler = clickActions[btn.dataset.action];
    if (handler) handler(btn, e);
  });
  document.addEventListener('submit', createSubmitDispatcher(submitActions));

  // Bind change password form
  const cpForm = document.getElementById('change-password-form');
  if (cpForm) {
    cpForm.addEventListener('submit', (e) => handleChangePassword(e, auth));
  }

  // Bind reset password form
  const resetForm = document.getElementById('reset-form');
  if (resetForm) {
    resetForm.addEventListener('submit', (e) => sendResetLink(e, auth));
  }

  // Student submit button
  const submitBtn = document.getElementById('submit-request-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => submitReservation());
  }

  _initAuthListener(auth, db, state, resetState,
    (role, userData, studentData) => _setupSession(role, userData, studentData, state, db)
  );

  // Iniciar router del panel admin - se mantiene inactivo hasta que showView('admin')
  // le quite 'hidden' al #admin-dashboard. El handler del router actualizará el
  // sidebar activo y mostrará la sección default (calendario).
  initAdminRouter();

  // Burger único en el topbar: en desktop colapsa el sidebar a icon-only
  // (con persistencia en localStorage); en mobile (<1024px) abre/cierra el drawer overlay
  const burger = document.getElementById('admin-burger');
  const sidebar = document.getElementById('admin-sidebar');
  if (burger && sidebar) {
    const STORAGE_KEY = 'redlab.sidebar.collapsed';
    const isMobile = () => window.matchMedia('(max-width: 1023px)').matches;
    if (localStorage.getItem(STORAGE_KEY) === '1') {
      sidebar.classList.add('admin-sidebar-collapsed');
      burger.setAttribute('aria-label', 'Expandir navegación');
      burger.setAttribute('aria-expanded', 'false');
    }
    burger.addEventListener('click', () => {
      if (isMobile()) {
        const isShown = !sidebar.classList.contains('admin-sidebar-open');
        sidebar.classList.toggle('admin-sidebar-open', isShown);
        burger.setAttribute('aria-expanded', String(isShown));
      } else {
        const nowCollapsed = sidebar.classList.toggle('admin-sidebar-collapsed');
        localStorage.setItem(STORAGE_KEY, nowCollapsed ? '1' : '0');
        burger.setAttribute('aria-expanded', String(!nowCollapsed));
        burger.setAttribute('aria-label', nowCollapsed ? 'Expandir navegación' : 'Contraer navegación');
      }
    });
    // Cerrar sidebar al navegar (cualquier click en un sidebar-item)
    sidebar.addEventListener('click', (e) => {
      const item = e.target.closest('.sidebar-item');
      if (item && isMobile()) {
        sidebar.classList.remove('admin-sidebar-open');
        burger?.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Menú hamburguesa del estudiante: cierra al tocar fuera, con Escape o al
  // elegir una opción (la acción delegada igual se ejecuta).
  const studentMenuBtn = document.getElementById('student-menu-btn');
  const studentMenu = document.getElementById('student-menu');
  const closeStudentMenu = () => {
    if (!studentMenu || studentMenu.classList.contains('hidden')) return;
    studentMenu.classList.add('hidden');
    studentMenuBtn?.setAttribute('aria-expanded', 'false');
    studentMenuBtn?.setAttribute('aria-label', 'Abrir menú');
  };
  if (studentMenuBtn && studentMenu) {
    document.addEventListener('click', (e) => {
      if (e.target.closest('.student-menu-wrap')) {
        // Click en una opción: cierra (el toggle lo maneja su propio botón).
        if (e.target.closest('.student-menu-item')) closeStudentMenu();
        return;
      }
      closeStudentMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeStudentMenu();
    });
  }

  // Poblar avatar + nombre + rol del usuario actual en el footer del sidebar
  try {
    const { state } = await import('./state.js');
    const avatarEl = document.getElementById('sidebar-user-avatar');
    const nameEl = document.getElementById('sidebar-user-name');
    const roleEl = document.getElementById('sidebar-user-role');
    if (state?.user) {
      const displayName = state.user.displayName || state.user.email?.split('@')[0] || 'Usuario';
      const initials = (state.user.displayName || state.user.email || 'U')
        .split(/\s+|@/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || 'U';
      if (avatarEl) avatarEl.textContent = initials;
      if (nameEl) nameEl.textContent = displayName;
      if (roleEl) {
        const role = state.role || 'admin';
        roleEl.textContent = role.toUpperCase();
      }
    }
  } catch (_) { /* state.js no listo o sidebar ausente — no-op */ }
});
