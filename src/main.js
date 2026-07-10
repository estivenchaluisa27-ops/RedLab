/**
 * src/main.js — Punto de entrada de la aplicación
 * Inicializa infraestructura, expone utilidades como globals,
 * y maneja event delegation para data-action handlers.
 */
import { initFirebase, RESERVATIONS_COLLECTION } from './firebase-config.js';
import { state, resetState, clearListeners, setUnsubscribers } from './state.js';
import { alert as notifyAlert } from './utils/notify.js';
import { showView, el, showHide, toggleHidden } from './utils/dom.js';
import { escapeHtml, escapeAttr } from './utils/escape.js';
import { getWeekDays, formatDateYYYYMMDD, isPastDate } from './utils/dates.js';
import { buildCourseId } from './courses/course-utils.js';
import { initAuthListener as _initAuthListener, setupSession as _setupSession, unsubscribeAuthListener } from './auth/auth.js';
import { handleLogin, handleLogout, togglePassword, openResetModal, closeResetModal, sendResetLink, openChangePasswordModal, closeChangePasswordModal, handleChangePassword } from './auth/auth-ui.js';
import { bindLoginView } from './views/login-view.js';
import { initCoursesList, loadAdminDashboard } from './courses/courses-list.js';
import { initCourses, openCreateCourseModal, createCourse, openEditCourseModal, saveCourseChanges } from './courses/courses.js';
import { initGroups, openCourseManager, addGroup, deleteGroup } from './groups/groups.js';
import { initGroupDetails, openGroupDetails, saveGroupBasicInfo, saveLeaderInfo, enableMemberEdit, cancelMemberEdit, saveMemberChange, deleteMember, addNewMember } from './groups/group-details.js';
import { initReservations, batchBlockAction, submitReservation, admAct, rejectReq, deleteReservation, openAttendanceModal, setAttendance, executeRecurringBlock } from './reservations/reservations.js';
import { initReports, openReportModal, executeReport } from './reports/reports.js';
import { initCalendar, setupAdminCalendarLogic, setupStudentView, switchTab, clearCalendarListeners } from './calendar/calendar.js';

window._nativeAlert = window.alert;
window.alert = notifyAlert;

window.escapeHtml = escapeHtml;
window.escapeAttr = escapeAttr;
window.getWeekDays = getWeekDays;
window.formatDateYYYYMMDD = formatDateYYYYMMDD;
window.isPastDate = isPastDate;
window.buildCourseId = buildCourseId;
window.showView = showView;
window.el = el;
window.showHide = showHide;
window.toggleHidden = toggleHidden;
window.RESERVATIONS_COLLECTION = RESERVATIONS_COLLECTION;

window._appState = state;
window._resetState = resetState;
window._clearListeners = clearListeners;
window._setUnsubscribers = setUnsubscribers;

window.handleLogout = () => handleLogout(() => { unsubscribeAuthListener(); clearListeners(); clearCalendarListeners(); }, window._auth);
window.openResetModal = openResetModal;
window.closeResetModal = closeResetModal;
window.sendResetLink = (e) => sendResetLink(e, window._auth);
window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.handleChangePassword = (e) => handleChangePassword(e, window._auth);

window.loadAdminDashboard = loadAdminDashboard;
window.openCreateCourseModal = openCreateCourseModal;
window.createCourse = createCourse;
window.openEditCourseModal = openEditCourseModal;
window.saveCourseChanges = saveCourseChanges;

window.openCourseManager = openCourseManager;
window.addGroup = addGroup;
window.deleteGroup = deleteGroup;
window.openGroupDetails = openGroupDetails;
window.saveGroupBasicInfo = saveGroupBasicInfo;
window.saveLeaderInfo = saveLeaderInfo;
window.enableMemberEdit = enableMemberEdit;
window.cancelMemberEdit = cancelMemberEdit;
window.saveMemberChange = saveMemberChange;
window.deleteMember = deleteMember;
window.addNewMember = addNewMember;

window.batchBlockAction = batchBlockAction;
window.submitReservation = submitReservation;
window.admAct = admAct;
window.rejectReq = rejectReq;
window.deleteReservation = deleteReservation;
window.openAttendanceModal = openAttendanceModal;
window.setAttendance = setAttendance;
window.executeRecurringBlock = executeRecurringBlock;

window.openReportModal = openReportModal;
window.executeReport = executeReport;

window.switchTab = switchTab;
window._setupAdminCalendarLogic = setupAdminCalendarLogic;
window._setupStudentView = setupStudentView;

document.addEventListener('DOMContentLoaded', () => {
  const { db, auth } = initFirebase();
  window._db = db;
  window._auth = auth;

  initCoursesList(db, state);
  initCourses(db, state);
  initGroups(db, state);
  initGroupDetails(db, state);
  initReservations(db, state, RESERVATIONS_COLLECTION);
  initReports(db, state);
  initCalendar(db, RESERVATIONS_COLLECTION);

  bindLoginView(auth);

  // Event delegation — all data-action handlers
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    // Auth
    if (action === 'handle-logout') window.handleLogout();
    if (action === 'open-change-password-modal') window.openChangePasswordModal();
    if (action === 'close-change-password-modal') window.closeChangePasswordModal();
    if (action === 'open-reset-modal') openResetModal();
    if (action === 'close-reset-modal') closeResetModal();

    // Close any modal
    if (action === 'close-modal') {
      const target = btn.dataset.target;
      if (target) document.getElementById(target)?.classList.add('hidden');
    }

    // Tabs
    if (action === 'switch-tab') window.switchTab(btn.dataset.tab);

    // Courses
    if (action === 'open-edit-course') window.openEditCourseModal(btn.dataset.id);
    if (action === 'open-course-manager') window.openCourseManager(btn.dataset.id);
    if (action === 'open-create-course-modal') window.openCreateCourseModal();
    if (action === 'open-report-modal') window.openReportModal();
    if (action === 'delete-reservation') window.deleteReservation(btn.dataset.id);
    if (action === 'set-attendance') {
      window.setAttendance(btn.dataset.group, btn.dataset.date, btn.dataset.cedula, btn.dataset.present === 'true', btn);
    }
    if (action === 'toggle-matrix-cell') btn.classList.toggle('selected');
    if (action === 'open-recurring-modal') document.getElementById('recurring-modal')?.classList.remove('hidden');

    // Groups
    if (action === 'open-group-details') window.openGroupDetails(btn.dataset.id);
    if (action === 'delete-group') window.deleteGroup(btn.dataset.id);
    if (action === 'save-member-change') window.saveMemberChange(parseInt(btn.dataset.index));
    if (action === 'cancel-member-edit') window.cancelMemberEdit();
    if (action === 'enable-member-edit') window.enableMemberEdit(parseInt(btn.dataset.index));
    if (action === 'delete-member') window.deleteMember(parseInt(btn.dataset.index));
    if (action === 'add-group') window.addGroup();
    if (action === 'save-group-basic-info') window.saveGroupBasicInfo();
    if (action === 'save-leader-info') window.saveLeaderInfo();
    if (action === 'add-new-member') window.addNewMember();

    // Pending requests (dynamically generated)
    if (action === 'adm-act') {
      window.admAct(btn.dataset.id, btn.dataset.app === 'true', btn.dataset.date, parseInt(btn.dataset.hour), btn.dataset.group);
    }
    if (action === 'reject-req') {
      window.rejectReq(btn.dataset.id);
    }
  });

  // Form submissions via data-action
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-action]');
    if (!form) return;
    const action = form.dataset.action;

    if (action === 'create-course') window.createCourse(e);
    if (action === 'save-course-changes') window.saveCourseChanges(e);
    if (action === 'execute-recurring-block') window.executeRecurringBlock(e);
    if (action === 'execute-report') window.executeReport(e);
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
    submitBtn.addEventListener('click', () => window.submitReservation());
  }

  _initAuthListener(auth, db, state, resetState,
    (role, userData, studentData) => _setupSession(role, userData, studentData, state, db)
  );
});
