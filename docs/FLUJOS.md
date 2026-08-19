# RedLab — Flujos principales

## 1. Acceso y roles

1. El usuario inicia sesión con email/contraseña (Firebase Auth).
2. La app consulta su rol: `admins/`, `professors/` o `student_directory/`.
3. Según el rol, `router.js` + `admin-router-controller.js` muestran las vistas permitidas (login, dashboard de estudiante o panel admin/profesor).

## 2. Reserva de sala (estudiante)

1. El estudiante ve el **calendario** (`calendar/calendar.js`) con los horarios disponibles del laboratorio.
2. Selecciona fecha y hora y crea la reserva → se inserta en `reservations/` con `status: 'pending'`.
3. El sistema registra una notificación tipo `solicitada` para su historial.
4. **Profesor/admin**: revisa la solicitud y aprueba (`approved`), rechaza (`rejected`) o el admin puede marcar el horario como `blocked` (inutilizable).
5. Cada cambio de estado genera una notificación (`aprobada`, `rechazada`, `bloqueada`).
6. El estudiante puede cancelar reservas propias en `pending`/`approved` (notificación `cancelada`).

## 3. Gestión de cursos y grupos (admin/profesor)

1. El admin crea el curso (`courses/`) y lo asigna a un profesor (`professorEmail`).
2. El profesor edita su curso y administra los grupos (`courses/{courseId}/groups/`).
3. El admin carga el **directorio estudiantil** (`student_directory/`), vinculando a cada estudiante a su `courseId` y `groupId`.
4. El grid de miembros (`groups/member-grid.js`) muestra la composición de cada grupo.

## 4. Notificaciones push (Android)

1. En el arranque móvil, `notifications/push.js` solicita permiso y obtiene el **token FCM** del dispositivo.
2. El token se **agrega al array `tokens`** del documento `device_tokens/{uid}` (junto a `email`).
3. **Push server** (`redlab-push-server/`, Node + FCM en Fly.io): **escucha cambios en `reservations`** (Firestore `onSnapshot`) y envía push según el caso:
   - **nueva solicitud** (`pending`) → a los profesores del curso;
   - **aprobada** → al estudiante;
   - **bloqueada** → a todos los involucrados;
   - **rechazada/cancelada** → al estudiante (cuando se borra la reserva).
4. El dispositivo Android la muestra; la notificación también queda en el **historial** (`notifications/`, visible en la app).

> Requisito de despliegue: `redlab-push-server/.env` con credenciales FCM y `service-account.json` de Firebase (ver `.env.example`).

## 5. Historial de notificaciones in-app

1. Toda notificación se persiste en `notifications/{notificationId}` con `read: false`.
2. El estudiante ve su listado (`notifications/history.js`) y el contador de no leídas.
3. Al abrirla, se marca `read: true` (regla valida que solo cambie ese campo).

## 6. Build Android

```bash
npm run cap:sync        # build app + sync Capacitor
# abrir android/ en Android Studio y compilar el APK
```

## Docs relacionados

- [Arquitectura](ARQUITECTURA.md)
- [Firestore](FIRESTORE.md)
- [Índice](INDICE.md)