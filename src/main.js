/**
 * src/main.js — Punto de entrada de la aplicación
 * Inicializa infraestructura y maneja event delegation para data-action handlers.
 */
import { initFirebase, RESERVATIONS_COLLECTION } from './firebase-config.js';
import { state, resetState, clearListeners } from './state.js';
import { initAuthListener as _initAuthListener, setupSession as _setupSession, unsubscribeAuthListener } from './auth/auth.js';
import { handleLogout, sendResetLink, openResetModal, closeResetModal, openChangePasswordModal, closeChangePasswordModal, handleChangePassword, openSignupModal, closeSignupModal, handleSignup } from './auth/auth-ui.js';
import { bindLoginView } from './views/login-view.js';
import { initCoursesList, clearCoursesListener } from './courses/courses-list.js';
import { initCourses, createCourse, saveCourseChanges, setupEditCourseView } from './courses/courses.js';
import { initGroups, addGroup, deleteGroup, setupCourseGroupsView, clearGroupsListener } from './groups/groups.js';
import { initGroupDetails, setupGroupDetailsView, destroyGroupDetailsView, saveGroupBasicInfo, saveLeaderInfo } from './groups/group-details.js';
import { initReservations, submitReservation, admAct, rejectReq, deleteReservation, setAttendance, executeRecurringBlock } from './reservations/reservations.js';
import { initReports, setupReportesView, executeReport } from './reports/reports.js';
import { initCalendar, clearCalendarListeners, setupAdminCalendarLogic } from './calendar/calendar.js';
import { initMotionObserver, handlePress } from './utils/motion.js';
import { initSentry } from './utils/sentry.js';
import { createClickDispatcher, createSubmitDispatcher } from './utils/dispatcher.js';
import { initAdminRouter, registerSectionSetup, registerSubviewSetup, registerSubviewOnLeave } from './admin-router-controller.js';
import { navigate } from './router.js';

document.addEventListener('DOMContentLoaded', () => {
  initSentry();
  initMotionObserver();
  document.addEventListener('pointerdown', handlePress, true);
  const { db, auth } = initFirebase();

  initCoursesList(db, state);
  initCourses(db, state);
  initGroups(db, state);
  initGroupDetails(db, state);
  initReservations(db, state, RESERVATIONS_COLLECTION);
  initReports(db, state);
  initCalendar(db, RESERVATIONS_COLLECTION);

  // Router admin — registro de setups por sección y sub-vista
  registerSectionSetup('calendario', () => setupAdminCalendarLogic(), { rerunOnEveryEnter: true });
  registerSectionSetup('cursos', () => { /* la sub-view activa decide setup, ver registerSubviewSetup */ });
  registerSectionSetup('reportes', () => setupReportesView(), { rerunOnEveryEnter: true });

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

  // Event delegation — all data-action handlers
  const clickActions = {
    'handle-logout': () => handleLogout(() => { unsubscribeAuthListener(); clearListeners(); clearCalendarListeners(); clearCoursesListener(); }, auth),
    'open-change-password-modal': () => openChangePasswordModal(),
    'close-change-password-modal': () => closeChangePasswordModal(),
    'open-reset-modal': () => openResetModal(),
    'close-reset-modal': () => closeResetModal(),
    'open-signup-modal': () => openSignupModal(),
    'close-signup-modal': () => closeSignupModal(),

    // Close any modal
    'close-modal': (btn) => {
      const target = btn.dataset.target;
      if (target) document.getElementById(target)?.classList.add('hidden');
    },

    // Courses — ahora navegan a sub-vistas en vez de abrir modales
    'open-edit-course': (btn) => navigate(`#/admin/cursos/${encodeURIComponent(btn.dataset.id)}/editar`),
    'open-course-manager': (btn) => navigate(`#/admin/cursos/${encodeURIComponent(btn.dataset.id)}/grupos`),
    'open-create-course-modal': () => navigate('#/admin/cursos/nuevo'),
    'open-report-modal': () => navigate('#/admin/reportes'),
    'delete-reservation': (btn) => deleteReservation(btn.dataset.id),
    'set-attendance': (btn) => {
      setAttendance(btn.dataset.group, btn.dataset.date, btn.dataset.cedula, btn.dataset.present === 'true', btn);
    },
    'toggle-matrix-cell': (btn) => btn.classList.toggle('selected'),
    'open-recurring-modal': () => document.getElementById('recurring-modal')?.classList.remove('hidden'),

    // Groups — open-group-details navega a la sub-view grupo-detalle del courseId actual
    'open-group-details': (btn) => {
      // currentViewCourse fue seteado por setupCourseGroupsView al entrar a curso-grupos.
      const courseId = state.currentViewCourse;
      if (!courseId) return;
      navigate(`#/admin/cursos/${encodeURIComponent(courseId)}/grupos/${encodeURIComponent(btn.dataset.id)}`);
    },
    'delete-group': (btn) => deleteGroup(btn.dataset.id),
    'add-group': () => addGroup(),
    'save-group-basic-info': () => saveGroupBasicInfo(),
    'save-leader-info': () => saveLeaderInfo(),

    // Pending requests (dynamically generated)
    'adm-act': (btn) => {
      admAct(btn.dataset.id, btn.dataset.app === 'true', btn.dataset.date, parseInt(btn.dataset.hour), btn.dataset.group);
    },
    'reject-req': (btn) => {
      rejectReq(btn.dataset.id);
    },
  };

  // Form submissions via data-action
  const submitActions = {
    'create-course': (e) => createCourse(e),
    'save-course-changes': (e) => saveCourseChanges(e),
    'execute-recurring-block': (e) => executeRecurringBlock(e),
    'execute-report': (e) => executeReport(e),
    'create-account': (e) => handleSignup(e, auth),
  };

  document.addEventListener('click', createClickDispatcher(clickActions));
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

  // Iniciar router del panel admin — se mantiene inactivo hasta que showView('admin')
  // le quite 'hidden' al #admin-dashboard. El handler del router actualizará el
  // sidebar activo y mostrará la sección default (calendario).
  initAdminRouter();

  // Sidebar drawer en mobile: el botón burger toggla el sidebar a overlay
  const burger = document.getElementById('admin-burger');
  const sidebar = document.getElementById('admin-sidebar');
  if (burger && sidebar) {
    burger.addEventListener('click', () => {
      const isShown = !sidebar.classList.contains('admin-sidebar-open');
      sidebar.classList.toggle('admin-sidebar-open', isShown);
      burger.setAttribute('aria-expanded', String(isShown));
    });
    // Cerrar sidebar al navegar (cualquier click en un sidebar-item)
    sidebar.addEventListener('click', (e) => {
      const item = e.target.closest('.sidebar-item');
      if (item && window.matchMedia('(max-width: 767px)').matches) {
        sidebar.classList.remove('admin-sidebar-open');
        burger?.setAttribute('aria-expanded', 'false');
      }
    });
  }
});
