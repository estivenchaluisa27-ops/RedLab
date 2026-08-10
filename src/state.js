/**
 * src/state.js — Estado global de la aplicación
 */

export let state = {
  user: null,
  role: null,
  courseId: null,
  groupId: null,
  groupName: null,
  currentViewCourse: null,
  weekOffset: 0,
  selectedSlots: [],
  coursesCache: {},
  professorsCache: {},
  weeklyLimit: 4
};

export function resetState() {
  Object.assign(state, {
    user: null,
    role: null,
    courseId: null,
    groupId: null,
    groupName: null,
    currentViewCourse: null,
    weekOffset: 0,
    selectedSlots: [],
    coursesCache: {},
    professorsCache: {},
    weeklyLimit: 4
  });
}

let unsubscribeReservations = null;
let unsubscribePending = null;

export function setUnsubscribers(reservations, pending) {
  unsubscribeReservations = reservations;
  unsubscribePending = pending;
}

export function clearListeners() {
  if (unsubscribeReservations) { unsubscribeReservations(); unsubscribeReservations = null; }
  if (unsubscribePending) { unsubscribePending(); unsubscribePending = null; }
}
