/**
 * src/utils/sentry.js — Inicialización de Sentry (error tracking en producción)
 * Sentry se carga como script UMD clásico (bundle.min.js) en index.html.
 */

const SENTRY_DSN = "https://75acbec137cb795b1a0c930e792d5bf6@o4511719666876416.ingest.us.sentry.io/4511899379826688";

function isLocalhost() {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

/**
 * Inicializa Sentry. Debe llamarse lo antes posible en el arranque de la app.
 * Los errores no capturados y promises rechazadas se reportan automáticamente.
 */
export function initSentry() {
  if (!window.Sentry) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: isLocalhost() ? "development" : "production",
    release: "redlab@4.1",
    tracesSampleRate: 0,
    beforeSend(event) {
      // Descarta eventos sin excepción ni mensaje (p.ej. fallos de carga de recursos externos)
      if (!event.exception && !event.message) return null;
      return event;
    },
  });
}

/**
 * Asocia el email del usuario actual a los eventos. null limpia el contexto.
 * @param {string|null} email
 */
export function setSentryUser(email) {
  if (!window.Sentry) return;
  if (email) {
    Sentry.setUser({ id: email, email });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Limpia el contexto de usuario (logout).
 */
export function clearSentryUser() {
  if (!window.Sentry) return;
  Sentry.setUser(null);
}