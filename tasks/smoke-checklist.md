# Smoke checklist (F0B) — correr en local antes de cada merge a `master`

Servir con emuladores o hosting local; verificar con dos usuarios (admin + estudiante).

## Admin
- [ ] Login admin entra al panel sin errores de consola
- [ ] Calendario admin renderiza semana + solicitudes pendientes
- [ ] Cursos: crear, editar, ver grid; grupos: crear, editar miembros, borrar
- [ ] Aprobar y rechazar una reserva pendiente
- [ ] Marcar asistencia (presente/ausente)
- [ ] Bloqueo manual y bloqueo recurrente de horarios
- [ ] Reportes: generar y exportar Excel
- [ ] Todos los modales abren/cierran (botones ×, Cancelar, Escape)

## Estudiante
- [ ] Login student muestra calendario y sus reservas
- [ ] Crear solicitud → aparece `pending`
- [ ] Cancelar reserva propia `pending`/`approved`
- [ ] Notificaciones: historial y contador de no leídas

## Global
- [ ] Consola del navegador sin errores ni warnings nuevos
- [ ] Logout/login cambia de rol sin datos del usuario anterior
- [ ] `npm test` exit 0 (96 passed; reglas solo contra emulador)

---

# Ejecución 2026-10-02 (admin, sesión real `lab-redes-turnos`)

Servido por HTTP estático en `127.0.0.1:8123` + Playwright. Ojo: sin
`connectFirestoreEmulator`, el navegador habla con el **proyecto real**. Esta
corrida fue de solo lectura — no se creó ni modificó nada.

## Admin — ejecutado
- [x] Login admin entra al panel sin errores de consola → `#/admin/calendario`, 0 errores
- [x] Calendario admin renderiza semana + solicitudes pendientes → 5 columnas, 65 slots, 3 tablas
- [ ] Cursos: crear, editar, ver grid; grupos: crear, editar miembros, borrar — **no ejecutado (requiere escritura)**
- [ ] Aprobar/rechazar reserva pendiente — **no ejecutado (requiere escritura)**
- [ ] Marcar asistencia — **no ejecutado (requiere escritura)**
- [ ] Bloqueo manual y recurrente — **no ejecutado (requiere escritura)**
- [ ] Reportes: generar y exportar Excel — **no ejecutado**
- [ ] Todos los modales abren/cierran — parcial, no cubierto

## F3 — registro de listeners (el objetivo de la rama)
- [x] 9 clicks de `admin-next-week` / `admin-prev-week`: `slots=65` y `tables=3` constantes → **sin listeners zombi** (lo que el orden subscribe-antes-de-unsubscribe podría haber roto)
- [x] Un solo click avanza exactamente una semana (verificado aislado)
- [x] Sesión admin registra exactamente 4 claves: `auth:state`, `calendar:reservations`, `calendar:pending`, `courses:list`
- [x] Las 4 ausentes (`notifications:list`, `calendar:student-*`, `groups:list`) son correctas: `startNotificationsListener()` solo corre en la rama estudiante (`auth.js:126`)
- [x] Logout: quedan 0 listeners de sesión; `auth:state` reaparece por el `window.location.reload()` de `handleLogout`, que es el comportamiento correcto
- [x] Ciclo logout → login ×2: reconstruye las mismas 4 claves, `slots=65`, `tables=3` → **sin acumulación entre ciclos**

## Estudiante — no ejecutado
Falta una credencial de estudiante. Los 4 puntos dependen de escritura.

## Global
- [x] Sin errores de consola de la app. Los 2 errores observados son de **Sentry**: `CORS policy: No 'Access-Control-Allow-Origin'` al POST a `ingest.us.sentry.io` desde `127.0.0.1:8123`. Esperado en local, no afecta a hosting.
- [x] `npm test` exit 0 — **145 passed, 0 skipped** con emulador (105 + 40 reglas)

## Pendiente para cerrar el smoke
1. Sesión estudiante (credenciales) — cubre notificaciones y solicitudes
2. Los 5 puntos de escritura de admin, con tu OK explícito porque tocan Firestore real
