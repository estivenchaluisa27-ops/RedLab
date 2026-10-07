/**
 * src/actions.js — Mapas de data-action (click y submit)
 *
 * Extraídos de main.js en F5 para que el punto de entrada solo haga bootstrap y
 * cableado. Este módulo es el punto de composición: conoce todos los handlers,
 * y no es importado por ningún otro módulo, así que no introduce ciclos.
 *
 * Contrato del dispatcher (utils/dispatcher.js y el listener de click de main.js):
 * los handlers reciben (btn, e) en click y (e) en submit. Los que no usan el
 * evento lo ignoran; 'open-slot-info' necesita `e` para stopPropagation().
 */
import { state, clearAllListeners } from './state.js';
import { navigate } from './router.js';
import { clearGroupUtilsCache } from './groups/group-utils.js';
import {
  handleLogout, openResetModal, closeResetModal, openSignupModal, closeSignupModal,
  handleSignup, openChangePasswordModal, closeChangePasswordModal,
} from './auth/auth-ui.js';
import {
  deleteReservation, setAttendance, admAct, rejectReq, batchBlockAction,
  executeRecurringBlock,
} from './reservations/reservations.js';
import { addGroup, deleteGroup } from './groups/groups.js';
import { saveGroupBasicInfo, saveLeaderInfo } from './groups/group-details.js';
import { createCourse, saveCourseChanges } from './courses/courses.js';
import { openNotificationsModal } from './notifications/history.js';
import { executeReport } from './reports/reports.js';
import {
  handleAdminClick, handleStudentClick, openAdminSlotInfo, updateAdminActionBox,
  refreshAdminCalendar, refreshStudentCalendar, clearCalendarListeners,
} from './calendar/calendar.js';
import { selectStudentDay } from './calendar/student-day-view.js';

/**
 * Construye el mapa de handlers de click.
 * @param {{ auth: import('firebase/auth').Auth }} deps
 */
export function createClickActions({ auth }) {
  return {
    // clearAllListeners vacía el registro; los dos siguientes limpian estado
    // en memoria que NO vive en el registro y sobreviviría al logout.
    // clearCalendarListeners es idempotente respecto a clearAllListeners.
    'handle-logout': () => handleLogout(() => {
      clearAllListeners();
      clearCalendarListeners();
      clearGroupUtilsCache();
    }, auth),
    'open-notifications-modal': () => openNotificationsModal(),
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

    // Calendar — slots y navegación (los botones obtienen su data-action en
    // setupAdminCalendarLogic/setupStudentView y en el render de calendar.js)
    'admin-slot-toggle': (btn, e) => handleAdminClick(e, btn),
    'open-slot-info': (btn, e) => { e.stopPropagation(); openAdminSlotInfo(btn.dataset.date, btn.dataset.hour); },
    'admin-prev-week': () => { state.weekOffset--; state.selectedSlots = []; refreshAdminCalendar(); updateAdminActionBox(); },
    'admin-next-week': () => { state.weekOffset++; state.selectedSlots = []; refreshAdminCalendar(); updateAdminActionBox(); },
    'admin-block': () => batchBlockAction('block'),
    'admin-unblock': () => batchBlockAction('unblock'),
    'student-slot-toggle': (btn) => handleStudentClick(btn),
    'student-day-select': (btn) => selectStudentDay(btn.dataset.dayIndex),
    'student-prev-week': () => { state.weekOffset--; state.selectedSlots = []; refreshStudentCalendar(); },
    'student-next-week': () => { state.weekOffset++; state.selectedSlots = []; refreshStudentCalendar(); },
  };
}

/**
 * Construye el mapa de handlers de submit.
 * @param {{ auth: import('firebase/auth').Auth }} deps
 */
export function createSubmitActions({ auth }) {
  return {
    'create-course': (e) => createCourse(e),
    'save-course-changes': (e) => saveCourseChanges(e),
    'execute-recurring-block': (e) => executeRecurringBlock(e),
    'execute-report': (e) => executeReport(e),
    'create-account': (e) => handleSignup(e, auth),
  };
}