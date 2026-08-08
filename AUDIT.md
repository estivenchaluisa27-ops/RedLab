# Auditoría técnica — RedLab

Fecha: 2026-08-07 (actualizado: remeadiación fases 1-6 completada y desplegada)
Alcance: estado actual tras el refactor monolito → módulos (plan.md, fases 1-6 completadas).
Método: análisis estático del código fuente, reglas de Firestore, config de hosting y CI.

## Resumen ejecutivo

El refactor se completó con éxito: aplicación SPA vanilla JS de 20 módulos ES (`src/`),
HTML de 252 líneas sin handlers inline, delegación de eventos centralizada (`main.js:102`),
escapado XSS consistente (`escapeHtml`/`escapeAttr`) y arquitectura por capas
(infra → utils → features → views) con el patrón `init(db, state)` uniforme.

Quedan **3 hallazgos de seguridad (P0)** en las reglas de Firestore, dependencias con
CVEs conocidos (P1), acoplamiento residual vía `window.*` (P1) y deuda de rendimiento (P2).
El plan.md ya documenta parte de esta deuda; esta auditoría la confirma, la verifica
contra el código y añade hallazgos nuevos.

---

## P0 — Seguridad (Firestore rules)

> **Estado (2026-08-07/08): P0-1 y P0-2 REMEDIADOS** — `firestore.rules` endurecidas y
> desplegadas (commit FASE 1). Tests de validación añadidos y pasando (commit `b252d49`).
> P0-3 queda como **deuda aceptada** por decisión del propietario (véase el final de esta sección).

### P0-1. Spoofing de `courseId`/`groupName` en creación de reservas
`firestore.rules:41-55` — `isValidReservationCreate()` valida que `userId == auth.uid`,
pero **no cruza `courseId`/`groupName` contra `student_directory`**. Un estudiante puede
crear reservas `pending` bajo el nombre de OTRO grupo o curso (solo necesita que
`groupName != ''`), suplantando solicitudes en el calendario de otro grupo.

Falta equivalente de:
```
request.resource.data.groupName == get(/databases/$(database)/documents/student_directory/$(request.auth.token.email)).data.groupName
request.resource.data.courseId == get(...).data.courseId
```

**Remediado**: `isValidReservationCreate()` ahora exige
`courseId == currentStudentDirectory().data.courseId` y
`groupName == currentStudentGroupName()` (resuelto server-side desde
`courses/{courseId}/groups/{groupId}.name`). Presupuesto: 3 gets + 1 exists (< 10).

### P0-2. Lecturas demasiado amplias
- `firestore.rules:91` — estudiantes pueden leer **todos los cursos** de la institución
  (`isStudent() && resource.data.professorEmail != null`).
- `firestore.rules:124` — profesores leen **todas las reservas** de todos los cursos
  (`isProfessor()` sin filtrar por su curso).
- `firestore.rules:126` — estudiantes leen todos los `blocked` de todas las courses
  (el filtro de curso falta; el `groupName` se compara contra su propio grupo, pero los
  bloqueos se filtran solo por `status == 'blocked'`).

Impacto: fuga de metadatos (profesorEmail, horarios de toda la universidad) y del
calendario completo entre grupos/cursos.

**Remediado**:
- Cursos: estudiantes solo leen `courses` con `courseId == student_directory.courseId`
  (el login ya consulta por su curso).
- Reservas profesor: `blocked` + `approved` globales (necesarios para `admAct` y el
  conteo de ocupación física de 4 grupos/slot) + `pending` solo de sus cursos.
- Reservas estudiante: solo su curso + `blocked` globales (filtro por `courseId`,
  corrige además un bug latente: la regla comparaba contra `groupName`, campo que
  nunca se escribe en `student_directory`).
- Eliminadas 4 funciones helper muertas que el validador marcó como no usadas.

### P0-3. Límite semanal solo en cliente
Deuda #2 del plan.md, confirmada: `weeklyLimit` se valida únicamente en el front
(`src/reservations/reservations.js`). Con la API directa de Firestore un estudiante
puede crear N solicitudes pendientes. La regla de create valida forma, no política.

**Estado: DEUDA ACEPTADA (2026-08-07)** — decisión del propietario. Las rules de
Firestore no pueden contar documentos (sin agregaciones), así que el enforcement
robusto exige una Cloud Function `onCreate` transaccional (plan Blaze, pago por uso)
o un contador por usuario+semana validado en rules (no atómico bajo concurrencia).
Se descartan ambas: el cliente ya enforcea el límite y el abuso requiere requests
técnicas directas. Riesgo residual asumido y documentado.

---

## P1 — Dependencias y arquitectura

### P1-1. SheetJS 0.20.0 con CVEs conocidos
`index.html:14` carga `xlsx.full.min.js@0.20.0` desde `cdn.sheetjs.com`. La línea 0.20.x
anterior a 0.20.2 es vulnerable a prototype pollution (CVE-2023-30533) y ReDoS
(CVE-2024-22363). Actualizar a **0.20.3** (última publicada en el CDN oficial).

### P1-2. CDN sin SRI (integrity)
Ninguno de los 3 CDNs (`index.html`: Font Awesome 6.0.0, SheetJS, SweetAlert2) usa
atributos `integrity` + `crossorigin`. Riesgo de supply-chain. Font Awesome 6.0.0
está desactualizada (última 6.7.x).

### P1-3. ~50 globales en `window.*`
`main.js:24-89` expone ~50 símbolos en `window`, y el dispatcher de `data-action`
(`main.js:108-165`) resuelve cada acción con `window.fn(...)` — una cadena de ~30
`if/else`. Los callers inline (`onclick` en HTML/JS) obligan al puente. Solución:
mapa interno `const actions = { 'open-course-manager': openCourseManager, ... }`
+ `btn.addEventListener('click', ...)` al crear botones dinámicos; se elimina
`window.*` y el dispatcher se reduce a un lookup.

### P1-4. Acoplamiento entre módulos vía `window`
- `src/courses/courses-list.js:64` — `window._setupAdminCalendarLogic()`
- `src/auth/auth.js:74,95` — `window.loadAdminDashboard()` / `window.setupStudentView()`
  con comentario "Temporal: función aún no extraída"
- `src/calendar/calendar.js:153,262,263,284` — `window.openAttendanceModal`, etc.

Deben ser imports directos (`import { setupAdminCalendarLogic } from ...`).

### P1-5. Monkey-patching de `alert`
`main.js:24-25` reemplaza `window.alert` por `notifyAlert` y guarda el original en
`window._nativeAlert`. Fragilidad: si `notify.js` no carga, el app entero usa alert
silencioso. `group-details.js` mezcla `alert()` (líneas 28, 42, 95, 96, 118, 135, 148,
162, 169, 182) con `Swal` y `confirm()` nativo (línea 152) — UX inconsistente.

---

## P2 — Rendimiento y calidad

### P2-1. N+1 en `listenAdminPending`
`src/calendar/calendar.js:210,226` — por cada solicitud pendiente, dos `getDoc`
secuenciales (curso + profesor). Con 20 solicitudes: 40+ lecturas en serie.
Usar `Promise.all` o caché por curso/profesor.

### P2-2. Cache `Map` sin invalidación
`lookupMembersByGroupName` (`src/groups/group-utils.js`) cachea en `Map` sin
mecanismo de invalidación; `clearGroupUtilsCache` debe invocarse tras cambios
de miembros.

### P2-3. Sin linter ni verificación de CSS en CI
`deploy.yml` solo corre vitest + deploy. No hay ESLint ni comprobación de que
`styles.css` esté al día con `build:css` (riesgo #13 del plan, mitigado solo
por pre-commit local).

### P2-4. Cobertura de tests limitada
Tests unitarios de funciones puras (dates, escape, classifySlot). Sin tests de
reglas de Firestore (emulador), ni de dispatcher, ni de render de calendario.

### P2-5. Cache-Control agresivo
`firebase.json:19` — `no-cache, no-store, must-revalidate` para todo js/css/html:
cada visita re-descarga todos los módulos. Correcto para evitar staleness, pero sin
hashing de archivos no hay forma de cachear assets inmutables (deuda de performance).

---

## P3 — Limpieza y menor

- `src/utils/swal-bootstrap.js` — comentarios con caracteres corruptos
  (líneas 3, 8: texto chino incrustado).
- Archivo `git` vacío (0 bytes) en la raíz del repo — artefacto accidental.
- 14 hallazgos de accesibilidad pendientes de REPORT.md (focus trap en modales,
  aria-labels, tablas sin `scope`).
- Sin meta description / Open Graph (SEO básico; menor por ser app autenticada).

---

## Lo que está bien (mantener)

- Delegación `data-action` centralizada; cero `onclick` inline en HTML.
- Escapado consistente: `escapeHtml`/`escapeAttr` en todos los renders dinámicos.
- `state.js` con `setUnsubscribers`/`clearListeners` y reset limpio de suscriptores.
- Reglas de Firestore bien estructuradas con funciones auxiliares reutilizables.
- Plan.md honesto y detallado: documenta riesgos y deuda explícitamente.
- Ordenación `localeCompare` con `numeric: true` en tablas.
- Manejo de errores con try/catch en todas las operaciones Firestore.
- **Tests de rules con emulador** (Java 21 instalado localmente, 19 tests validando P0-1, P0-2).

---

## Plan de acción recomendado

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 1 | Cruzar `courseId`/`groupName` contra `student_directory` en `isValidReservationCreate` | P0 | Bajo |
| 2 | Acotar lecturas: cursos por curso del estudiante; reservas por curso del profesor; bloqueos por curso | P0 | Medio |
| 3 | Validar `weeklyLimit` en las reglas (contar pendientes+confirmadas del usuario en la semana) | P0 | Alto |
| 4 | SheetJS → 0.20.3; añadir SRI+crossorigin a los 3 CDNs | P1 | Bajo |
| 5 | Mapa de acciones + imports directos; eliminar `window.*` | P1 | Medio |
| 6 | `Promise.all` en `listenAdminPending` | P2 | Bajo |
| 7 | ESLint + verificación `build:css` en CI | P2 | Bajo | ✅ FASE 6 |
| 8 | Tests de reglas con emulador | P2 | Medio | ✅ FASE 7 — 19 tests pasando (Java 21 instalado) |
| 9 | Limpieza: swal-bootstrap corrupto, archivo `git` vacío, unificar alert/Swal | P3 | Bajo | ✅ FASE 3 |
| 10 | Accesibilidad (focus trap, aria) | P3 | Medio | Pendiente |
