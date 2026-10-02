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
import { initCalendar, setupAdminCalendarLogic, updateAdminActionBox, updateStudentUI } from './calendar/calendar.js';
import { initMotionObserver, handlePress } from './utils/motion.js';
import { initSentry } from './utils/sentry.js';
import { createSubmitDispatcher } from './utils/dispatcher.js';
import { initAdminRouter, registerSectionSetup, registerSubviewSetup, registerSubviewOnLeave } from './admin-router-controller.js';
import { createClickActions, createSubmitActions } from './actions.js';

document.addEventListener('DOMContentLoaded', async () => {
  initSentry();
  initMotionObserver();
  document.addEventListener('pointerdown', handlePress, true);
  const { db, auth } = await initFirebase();

  initCoursesList(db, state);
  initCourses(db, state);
  initGroups(db, state);
  initGroupDetails(db, state);
  initReservations(db, state, RESERVATIONS_COLLECTION, { updateAdminActionBox, updateStudentUI });
  initReports(db, state);
  initCalendar(db, RESERVATIONS_COLLECTION);
  initNotifications(db, state);

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

  // Event delegation — los mapas de data-action viven en src/actions.js
  const clickActions = createClickActions({ auth });
  const submitActions = createSubmitActions({ auth });

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

  // Iniciar router del panel admin — se mantiene inactivo hasta que showView('admin')
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
