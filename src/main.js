/**
 * src/main.js — Punto de entrada de la aplicación
 * Inicializa infraestructura y maneja event delegation para data-action handlers.
 */
import { initFirebase, RESERVATIONS_COLLECTION } from './firebase-config.js';
import { state, resetState, clearListeners } from './state.js';
import { initAuthListener as _initAuthListener, setupSession as _setupSession, unsubscribeAuthListener } from './auth/auth.js';
import { handleLogout, sendResetLink, openResetModal, closeResetModal, openChangePasswordModal, closeChangePasswordModal, handleChangePassword } from './auth/auth-ui.js';
import { bindLoginView } from './views/login-view.js';
import { initCoursesList } from './courses/courses-list.js';
import { initCourses, openCreateCourseModal, createCourse, openEditCourseModal, saveCourseChanges } from './courses/courses.js';
import { initGroups, openCourseManager, addGroup, deleteGroup } from './groups/groups.js';
import { initGroupDetails, openGroupDetails, saveGroupBasicInfo, saveLeaderInfo, enableMemberEdit, cancelMemberEdit, saveMemberChange, deleteMember, addNewMember } from './groups/group-details.js';
import { initReservations, submitReservation, admAct, rejectReq, deleteReservation, setAttendance, executeRecurringBlock } from './reservations/reservations.js';
import { initReports, openReportModal, executeReport } from './reports/reports.js';
import { initCalendar, switchTab, clearCalendarListeners } from './calendar/calendar.js';

document.addEventListener('DOMContentLoaded', () => {
  const { db, auth } = initFirebase();

  initCoursesList(db, state);
  initCourses(db, state);
  initGroups(db, state);
  initGroupDetails(db, state);
  initReservations(db, state, RESERVATIONS_COLLECTION);
  initReports(db, state);
  initCalendar(db, RESERVATIONS_COLLECTION);

  bindLoginView(auth);

  // Event delegation — all data-action handlers
  const clickActions = {
    'handle-logout': () => handleLogout(() => { unsubscribeAuthListener(); clearListeners(); clearCalendarListeners(); }, auth),
    'open-change-password-modal': () => openChangePasswordModal(),
    'close-change-password-modal': () => closeChangePasswordModal(),
    'open-reset-modal': () => openResetModal(),
    'close-reset-modal': () => closeResetModal(),

    // Close any modal
    'close-modal': (btn) => {
      const target = btn.dataset.target;
      if (target) document.getElementById(target)?.classList.add('hidden');
    },

    // Tabs
    'switch-tab': (btn) => switchTab(btn.dataset.tab),

    // Courses
    'open-edit-course': (btn) => openEditCourseModal(btn.dataset.id),
    'open-course-manager': (btn) => openCourseManager(btn.dataset.id),
    'open-create-course-modal': () => openCreateCourseModal(),
    'open-report-modal': () => openReportModal(),
    'delete-reservation': (btn) => deleteReservation(btn.dataset.id),
    'set-attendance': (btn) => {
      setAttendance(btn.dataset.group, btn.dataset.date, btn.dataset.cedula, btn.dataset.present === 'true', btn);
    },
    'toggle-matrix-cell': (btn) => btn.classList.toggle('selected'),
    'open-recurring-modal': () => document.getElementById('recurring-modal')?.classList.remove('hidden'),

    // Groups
    'open-group-details': (btn) => openGroupDetails(btn.dataset.id),
    'delete-group': (btn) => deleteGroup(btn.dataset.id),
    'save-member-change': (btn) => saveMemberChange(parseInt(btn.dataset.index)),
    'cancel-member-edit': () => cancelMemberEdit(),
    'enable-member-edit': (btn) => enableMemberEdit(parseInt(btn.dataset.index)),
    'delete-member': (btn) => deleteMember(parseInt(btn.dataset.index)),
    'add-group': () => addGroup(),
    'save-group-basic-info': () => saveGroupBasicInfo(),
    'save-leader-info': () => saveLeaderInfo(),
    'add-new-member': () => addNewMember(),

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
  };

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const handler = clickActions[btn.dataset.action];
    if (handler) handler(btn);
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-action]');
    if (!form) return;
    const handler = submitActions[form.dataset.action];
    if (handler) handler(e);
  });

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
});
