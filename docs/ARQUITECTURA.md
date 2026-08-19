# RedLab — Arquitectura

Sistema de laboratorio de idiomas (red de salas): gestión de cursos, grupos, reservas de salas, calendario y **notificaciones push** en Android, con backend serverless en Firebase y un push server Node en Fly.io.

## Stack

| Capa | Tecnología |
|---|---|
| Cliente web | SPA vanilla JavaScript (ESM, sin framework), Tailwind CSS, SweetAlert2 |
| Cliente móvil | Capacitor 8 (Android), notificaciones push locales y remotas |
| Backend | Firebase: Hosting + Firestore (rules), Auth |
| Push server | Node.js + FCM en Fly.io (`redlab-push-server/`) |
| Tests | Vitest + Testing Library (`tests/`) |
| Lint | ESLint (`npm run lint`) |

## Componentes

```
┌─────────────────────┐      ┌──────────────────────┐
│  Web SPA (Firebase  │      │  Android (Capacitor) │
│  Hosting)           │      │  www/ + webview      │
└─────────┬───────────┘      └──────────┬───────────┘
          │ HTTPS / Firestore SDK        │ Firestore SDK
          ▼                              ▼
┌────────────────────────────────────────────────────┐
│                Firestore (datos)                   │
│  admins · professors · student_directory · courses │
│  groups · reservations · notifications ·           │
│  device_tokens                                      │
└──────────────┬─────────────────────┬───────────────┘
               │ FCM                │ device_tokens
               ▼                    ▼
        ┌──────────────┐    ┌─────────────────┐
        │ Fly.io push  │    │  Auth (email/   │
        │ server (FCM) │    │  contraseña)    │
        └──────────────┘    └─────────────────┘
```

## Módulos frontend (`src/`)

| Módulo | Responsabilidad |
|---|---|
| `main.js` + `router.js` | Arranque y enrutado por hash |
| `state.js` | Estado global de la sesión |
| `firebase-config.js` | Inicialización de Firebase |
| `auth/` | Login UI + gestión de sesión |
| `courses/` | Catálogo de cursos y materias |
| `groups/` | Grupos, detalle y grid de miembros |
| `reservations/` | Reservas de salas |
| `calendar/` | Calendario de reservas |
| `notifications/` | Historial (`history.js`) + push (FCM, `push.js`) |
| `reports/` | Reportes |
| `admin-router-controller.js` | Rutas del panel de administración |
| `utils/` | DOM, fechas, dispatcher de eventos, escape, motion, notify, Sentry |

## Seguridad

- **Firestore rules** por colección (ver [Firestore](FIRESTORE.md)): admins y profesores por email, estudiantes en directorio, reservas/notificaciones acotadas al propietario, `device_tokens` solo por el dueño del UID.
- **Fallback**: regla `match /{document=**}` deniega por defecto.
- **Sentry** integrado en `utils/sentry.js` para errores en producción.

## Notificaciones push

1. El cliente registra su dispositivo en FCM y guarda el token en `device_tokens/{uid}`.
2. El **push server** (Node + FCM, `redlab-push-server/`) lee los tokens y envía notificaciones.
3. Android muestra notificaciones locales (agenda) y remotas (push).
4. El historial se guarda en Firestore (`notifications/`).

> El push server se despliega en **Fly.io** (`fly.toml`). Requiere el `service-account.json` de Firebase (no versionado — ver `.env.example`).

## Build y despliegue

| Comando | Acción |
|---|---|
| `npm run build:css` | Compila Tailwind → `styles.css` |
| `npm run build:app` | Construye la app (copia a `www/` para Capacitor) |
| `npm run cap:sync` | Build + `npx cap sync android` |
| `npm test` / `npm run lint` | Tests (Vitest) y lint (ESLint) |
| `firebase deploy` | Publica Hosting + Firestore rules |

## Docs relacionados

- [Firestore (colecciones y reglas)](FIRESTORE.md)
- [Flujos principales](FLUJOS.md)
- [Índice](INDICE.md)