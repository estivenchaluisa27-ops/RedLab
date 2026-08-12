/**
 * src/utils/dispatcher.js — Dispatcher central de event delegation (data-action)
 * Extraído de main.js (AUDIT P1-3): convierte el if/else del dispatcher en un lookup.
 */
export function createClickDispatcher(actions) {
  return (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const handler = actions[btn.dataset.action];
    if (handler) handler(btn);
  };
}

export function createSubmitDispatcher(actions) {
  return (e) => {
    const form = e.target.closest('[data-action]');
    if (!form) return;
    const handler = actions[form.dataset.action];
    if (handler) handler(e);
  };
}
