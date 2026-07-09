# RedLab — Plan de Refactorización: Monolito → Modular

> **Documento vivo** — Actualizar después de cada sesión de trabajo.
> Última actualización: **2026-07-09** (Fase 7 completada)
> Estado global: **✅ Fases 0-7 completadas — refactor monolito→modular finalizado**

---

## Índice

1. [Estado actual del proyecto](#1-estado-actual-del-proyecto)
2. [Decisiones bloqueadas](#2-decisiones-bloqueadas)
3. [Estructura de destino](#3-estructura-de-destino)
4. [Mapeo línea-a-módulo](#4-mapeo-línea-a-módulo)
5. [Inventario de onclick / onsubmit a migrar](#5-inventario-de-onclick--onsubmit-a-migrar)
6. [Estrategia de migración onclick → event delegation](#6-estrategia-de-migración-onclick--event-delegation)
7. [Fases de ejecución](#7-fases-de-ejecución)
8. [Riesgos y mitigaciones](#8-riesgos-y-mitigaciones)
9. [Criterios de validación](#9-criterios-de-validación)
10. [Registro de sesiones](#10-registro-de-sesiones)
11. [Deuda técnica documentada](#11-deuda-técnica-documentada)

---

## 1. Estado actual del proyecto

### Archivo principal: `index.html` (1674 líneas, verificado con `Get-Content | Measure-Object`)

| Sección | Líneas | Contenido |
|---------|--------|-----------|
| CSS embebido (`<style>`) | 17–117 | Estilos custom sobre Tailwind |
| JS (`<script type="module">`) | 119–1438 | Toda la lógica de la app |
| HTML / Vistas / Modales | 1442–1674 | Markup SPA con vistas ocultas |

> [!NOTE]
> 1674 líneas contadas como líneas del archivo (incluyendo líneas vacías). En un análisis previo un subagente reportó 1512; ese conteo se debe a un `Measure-Object -Character` equivocado. Usar siempre `(Get-Content).Count` para conteo de líneas.

### Dependencias (CDN, sin package.json)

| Dependencia | Versión | Tipo | CDN URL |
|-------------|---------|------|---------|
| Tailwind CSS | Play CDN (dev) | CSS framework | `cdn.tailwindcss.com` |
| Firebase SDK | 11.6.1 | ES Modules | `gstatic.com/firebasejs/11.6.1/` |
| SweetAlert2 | 11 | UMD global (`Swal`) | `cdn.jsdelivr.net/npm/sweetalert2@11` |
| SheetJS (XLSX) | 0.20.0 | UMD global (`XLSX`) | `cdn.sheetjs.com/xlsx-0.20.0/` |
| FontAwesome | 6.0.0 | JS bundle | `cdnjs.cloudflare.com/.../font-awesome/6.0.0/` |
| Google Fonts | Roboto | CSS | `fonts.googleapis.com` |

### Infraestructura

- **Hosting**: Firebase Hosting, directorio raíz (`.`) como public.
- **CI**: GitHub Actions → `FirebaseExtended/action-hosting-deploy@v0` en push a `master`. Sin paso de build.
- **Firestore Rules**: 159 líneas, bien estructuradas con funciones auxiliares (`isAdmin`, `isStudent`, `isProfessor`).
- **Branch de trabajo**: `master` (directamente).
- **Archivos existentes**: `index.html`, `404.html`, `firebase.json`, `.firebaserc`, `firestore.rules`, `.gitignore`, `REPORT.md`.

### Conteos verificados (2026-07-09, re-verificados con subagentes)

| Métrica | Valor real (PowerShell `Select-String` + auditoría manual) |
|---------|---------------|
| Total líneas `index.html` | **1674** |
| Occurrences `onclick=` | **38** |
| Occurrences `onsubmit=` | **7** (no 6) |
| Líneas con handler inline | **45** (3 líneas tienen 2 onclick: 1470, 1508, 1511) |
| Funciones asignadas a `window.*` | **36** (incluye override `window.alert`) |
| Funciones asignadas a `window.*` (excluyendo override) | **35** |
| Funciones locales (no window) | **22** de las cuales solo **4 son puras** |
| Listeners `onSnapshot` activos | **6** (2 huérfanos sin unsubscribe + 1 `onAuthStateChanged` sin unsubscribe) |
| Variables `let` en scope de módulo | **8** + objeto `state` con 10 props mutables |

> [!CAUTION]
> El plan original (v1) decía "38 funciones window.*" y "~54 puntos de migración". Ambos son incorrectos.
>
> - **Funciones window.* = 36** (no 38): incluye el override `window.alert`.
> - **Puntos de migración reales = 45** (no 54): 38 onclick + 7 onsubmit, distribuidos en 19 HTML estático + 13 template literals JS + 11 inline classList + 7 onsubmit = 50 occurrences; pero como 5 inline classList + 2 onclick sin window están en modales que se cierran con `[data-close-modal]` (un solo listener delegado), el esfuerzo real de migración es ~45 puntos únicos.
>
> Ver [sección 5](#5-inventario-de-onclick--onsubmit-a-migrar) para el inventario completo revisado.

---

## 2. Decisiones bloqueadas

Estas decisiones están **cerradas** y no deben re-evaluarse salvo que haya un bloqueo técnico grave.

> [!WARNING]
> **Correcciones v2 (2026-07-09)**: las decisiones #4, #5, #6 y #7 tenían contradicciones o riesgos no documentados. Se mantienen los valores pero se añaden **salvedades** obligatorias.

| # | Decisión | Valor | Justificación | Salvedad v2 |
|---|----------|-------|---------------|-------------|
| 1 | Nivel de transformación | ES Modules nativos, sin bundler | 1674 líneas no justifican webpack/vite para producción | ⚠️ Firebase Hosting sirve `.js` como `application/javascript` por defecto (riesgo MIME sobredimensionado). Riesgo real: con `"public": "."` en `firebase.json`, **`/src/**/*.js` se desplegará a producción** aunque no se invoque — infla el deploy. Mitigación: añadir `src/**` a `ignore` SOLO si se usa bundler; si no, dejar desplegado. |
| 2 | Lógica de negocio | Se mueve sin cambios (fase 1) | Cloud Functions / validación server-side queda para fase posterior | ⚠️ **Bloqueador externo**: las `firestore.rules` actuales L129-132 **bloquean** `batchBlockAction` (L735) y `executeRecurringBlock` (L1060) porque exigen `isStudent() && status=='pending'`. La feature de bloqueo está rota en prod. Ver [sección 8 riesgo #10](#8-riesgos-y-mitigaciones). Resolver ANTES de empezar Fase 0. |
| 3 | XSS en atributos onclick | Migrar a event delegation con `data-*` | Vector XSS real confirmado en **3 líneas** (no 1): L927, L1006, L1007 | ⚠️ v1 solo marcaba L927. L1006 y L1007 interpolan `res.groupName` y `st.cedula` (PII) sin escapar. `escapeHtml` no sirve para atributos (no escapa `'`); `escapeAttr` (nuevo) es obligatorio. |
| 4 | Tests | Vitest solo en dev, no en deploy | `package.json` con devDependencies, `node_modules` nunca se despliega | ⚠️ **Contradecía #7**: si CI ejecuta `npm test` (decisión #7), Vitest es dependencia del **pipeline**. Resolución: `package.json` con `devDependencies` + `package-lock.json` commiteado; `node_modules/` y `*.local` en `.gitignore`. CI usa `npm ci` (requiere lockfile commiteado). |
| 5 | Tailwind | Compilar a estático con Tailwind CLI | Output `styles.css` se commitea; se quita el Play CDN de producción | ⚠️ **Riesgo de drift**: si un dev añade clases Tailwind en `src/**/*.js` y no recompila, las clases no existen. Mitigaciones obligatorias: (a) `package.json` script `"precommit": "npm run build:css"` vía husky/pre-commit hook; (b) CI ejecuta `npm run build:css && git diff --exit-code styles.css` — falla si `styles.css` no está actualizado. Sin esto, el artefacto commiteado se desincroniza. |
| 6 | Rama | Trabajar sobre `master` actual | El repo anterior queda en desuso | ⚠️ **Riesgo crítico**: `.github/workflows/firebase-hosting-github.yml` dispara deploy en push a `master`. Cualquier fase a medio ejecutar despliega a live. **Resolución obligatoria**: crear `refactor/modular` y trabajar ahí; el workflow solo dispara en `master`. Mergear a `master` solo al finalizar Fase 7 con smoke test pasado. |
| 7 | CI | Añadir `npm ci && npm test` antes del deploy | Solo si `package-lock.json` existe; requiere `actions/setup-node@v4` | ✅ Confirmado. `action-hosting-deploy@v0` tolera steps previos que fallen (deploy se omite si `npm test` falla). Añadir explícitamente `if: success()` en el step de deploy para hacerlo contrato. |
| 8 | Config Vitest | `vitest.config.js` (NO `.ts`) | No hay TypeScript en el proyecto | ✅ Sin cambios. |

---

## 3. Estructura de destino

> [!IMPORTANT]
> **Correcciones v2**: añadidos `calendar/header.js`, `utils/swal-bootstrap.js`. `view-router.js` se fusiona en `utils/dom.js`. `slots.js` ya NO es "helpers puros" (ver nota abajo).

```
RedLab/
├── index.html                        ← Solo markup + <link> + <script type="module" src="/src/main.js">
├── styles.css                        ← Output de Tailwind CLI (commiteado, NO en .gitignore)
├── package.json                      ← devDependencies + package-lock.json commiteado
├── package-lock.json                 ← Commiteado (necesario para npm ci en CI)
├── vitest.config.js                  ← env jsdom + alias @/ → ./src/
├── tailwind.config.js                ← content: ['./index.html', './src/**/*.js']
├── .gitignore                        ← Añadir node_modules/, *.local
├── firebase.json                     ← Añadir ignores: tests, configs dev, tailwind source
├── firestore.rules                   ← CORREGIR L129-132 (ver sección 8 riesgo #10) ANTES de fase 0
├── .firebaserc                       ← Sin cambios
├── 404.html                          ← Sin cambios
├── REPORT.md                         ← Sin cambios
│
├── src/
│   ├── main.js                       ← ENTRY POINT (< 50 líneas): bootstrap Firebase, monta listeners
│   ├── firebase-config.js            ← initializeApp, getAuth, getFirestore → export db, auth
│   ├── state.js                      ← state object + resetState + clearListeners
│   │
│   ├── styles/
│   │   └── tailwind-input.css        ← @tailwind base/components/utilities + CSS custom (líneas 17-117)
│   │
│   ├── utils/
│   │   ├── dom.js                    ← el(id), show/hide, toggleHidden, showView (fusionado de view-router.js)
│   │   ├── escape.js                 ← escapeHtml + escapeAttr (NUEVO, escapa ' también)
│   │   ├── dates.js                  ← getWeekDays, formatDateYYYYMMDD, isPastDate (SIN render DOM)
│   │   ├── notify.js                 ← wrapper SweetAlert2 + showMessage (línea 1026)
│   │   └── swal-bootstrap.js         ← NUEVO: importa SweetAlert2 como módulo, expone window.Swal para puente temporal
│   │
│   ├── auth/
│   │   ├── auth.js                   ← initAuthListener, setupSession, clearListeners re-export
│   │   └── auth-ui.js                ← handleLogin, handleLogout, togglePassword, reset/change password
│   │
│   ├── calendar/
│   │   └── calendar.js            ← renderCalendarHeader + admin/student calendar + pending + matrix + switchTab
│   │
│   ├── courses/
│   │   ├── courses.js                ← createCourse, openEditCourseModal, saveCourseChanges
│   │   ├── courses-list.js           ← grid de cursos + cargador select profesores
│   │   └── course-utils.js           ← buildCourseId (normalización MATERIA_PARALELO)
│   │
│   ├── groups/
│   │   ├── groups.js                 ← openCourseManager, addGroup, deleteGroup
│   │   ├── group-details.js          ← openGroupDetails, renderMembersTable, save/delete/add members
│   │   └── group-utils.js            ← lookupMembersByGroupName (compartido entre attendance y reports)
│   │
│   ├── reservations/
│   │   ├── reservations.js           ← submitReservation, listenAdminPending, admAct, rejectReq, deleteReservation
│   │   └── attendance.js             ← openAttendanceModal, setAttendance
│   │
│   ├── reports/
│   │   └── reports.js                ← openReportModal, toggleAllCourses, executeReport
│   │
│   ├── modals/
│   │   └── modal-utils.js            ← openModal(id) / closeModal(id) genéricos
│   │
│   └── views/
│       ├── login-view.js             ← bind form submit, togglePassword, reset modal
│       ├── admin-view.js             ← bind tabs, prev/next week, block/unblock, report, recurring
│       └── student-view.js           ← bind prev/next week, submit-request-btn
│
└── tests/
    ├── utils/
    │   ├── escape.test.js            ← escapeHtml, escapeAttr (casos XSS)
    │   ├── dates.test.js             ← getWeekDays, formatDateYYYYMMDD, isPastDate
    │   └── dom.test.js               ← show/hide, getters, showView
    ├── courses/
    │   └── course-utils.test.js      ← buildCourseId normalización
    ├── groups/
    │   └── group-utils.test.js       ← lookupGroupMembers caché + fallback
    ├── reports/
    │   └── reports.test.js           ← sorting, buildRow
    └── calendar/
        └── slots.test.js             ← classifySlot: past, blocked, partial, full, mine (con state inyectado)
```

> [!IMPORTANT]
> **`renderCalendarHeader`** (línea 701) manipula DOM (`getElementById`, `createElement`, `innerHTML`) Y es compartido entre `renderAdminCalendar` (L298) y `renderStudentCalendar` (L349). Si se pone solo en `admin-calendar.js` genera import circular `student-calendar → admin-calendar`. **Va en `calendar/header.js`** (módulo compartido).

> [!IMPORTANT]
> **`classifySlot`** (lógica de L319-335 y L369-376) referencia `state.weekOffset`, `state.user.email`, `unsubscribeReservations`. **NO es pura**. La extracción requiere **inyectar `state` por parámetro**: `classifySlot(slot, { weekOffset, userEmail, reservations })`. Los tests deben construir el objeto state inyectado.

> [!IMPORTANT]
> **Dependencia potencialmente circular**: `reservations/attendance.js` usa `group-utils.lookupMembersByGroupName`, y `groups/group-details.js` podría necesitar `reservations` para el modal de asistencia. **Regla**: `groups` NO importa de `reservations`; la coordinación se hace desde `calendar/admin-calendar.js` que orquesta ambos. `group-utils.js` es hoja (sin dependencias de reservations).

> [!IMPORTANT]
> **`view-router.js`** (v1) era un micro-módulo de 4 líneas (L1022-1025) con un solo export que usa `document.getElementById`. Se **fusiona en `utils/dom.js`** como `showView()` — no merece archivo propio.

> [!IMPORTANT]
> **`Swal` y `XLSX` como globales** (deuda #9 y #10): tras el refactor, quitar los CDNs romperá todo silenciosamente. `swal-bootstrap.js` importa SweetAlert2 como módulo y expone `window.Swal` temporalmente. `XLSX` se maneja en `reports.js` con `import * as XLSX from 'xlsx'` (npm) o se mantiene CDN con un comentario explícito de dependencia externa.

---

## 4. Mapeo línea-a-módulo

Referencia exacta para saber **de dónde sale cada cosa**. Las líneas son del `index.html` actual.

| Líneas | Contenido | Módulo destino |
|--------|-----------|---------------|
| 17–117 | CSS embebido `<style>` | `src/styles/tailwind-input.css` → `styles.css` |
| 119–122 | Firebase imports (app, auth, firestore) | `src/firebase-config.js` |
| 124 | `firebaseConfig` objeto | `src/firebase-config.js` |
| 126 | `RESERVATIONS_COLLECTION` constante | `src/firebase-config.js` |
| 127 | `let db, auth` | `src/firebase-config.js` |
| 128–132 | `state` objeto | `src/state.js` |
| 133–134 | `unsubscribeReservations`, `unsubscribePending` | `src/state.js` |
| 136–144 | `escapeHtml()` | `src/utils/escape.js` |
| 147–160 | `window.alert` override → SweetAlert2 | `src/utils/notify.js` |
| 162–167 | `DOMContentLoaded` → initApp | `src/main.js` |
| 169–172 | `clearListeners()` | `src/state.js` |
| 174–202 | `initAuthListener()` | `src/auth/auth.js` |
| 204–239 | `setupSession()` | `src/auth/auth.js` |
| 242–285 | `loadAdminDashboard()` (grid cursos + select profes) | `src/courses/courses-list.js` + `src/calendar/admin-calendar.js` |
| 287–295 | `setupAdminCalendarLogic()` | `src/calendar/admin-calendar.js` |
| 297–338 | `renderAdminCalendar()` | `src/calendar/admin-calendar.js` + `src/calendar/slots.js` |
| 340–380 | `setupStudentView()`, `renderStudentCalendar()` | `src/calendar/student-calendar.js` + `src/calendar/slots.js` |
| 382–403 | Auth UI: login, logout, password, reset | `src/auth/auth-ui.js` |
| 405–413 | `switchTab()` | `src/views/admin-view.js` |
| 415–416 | `openCreateCourseModal()` | `src/courses/courses.js` |
| 418–538 | `createCourse()`, `openEditCourseModal()`, `saveCourseChanges()` | `src/courses/courses.js` |
| 437–446 | `buildCourseId` lógica (cleanSubject + cleanParallel) | `src/courses/course-utils.js` |
| 540–587 | `openCourseManager()` | `src/groups/groups.js` |
| 590–607 | `addMemberToGroup()` — **CÓDIGO MUERTO, ELIMINAR** | ❌ Se borra |
| 609–696 | `addGroup()`, `deleteGroup()` | `src/groups/groups.js` |
| 698–699 | `getWeekDays()`, `formatDateYYYYMMDD()` | `src/utils/dates.js` |
| 700 | `isPastDate()` | `src/utils/dates.js` |
| 701 | `renderCalendarHeader()` | `src/calendar/header.js` (NO dates.js — usa DOM; NO admin-calendar.js — compartido admin+student) |
| 703–706 | `handleAdminClick()`, `updateAdminActionBox()` | `src/calendar/admin-calendar.js` |
| 707–729 | `handleStudentClick()`, `updateStudentUI()` | `src/calendar/student-calendar.js` |
| 728 | `updateAdminActionBox()` | `src/calendar/admin-calendar.js` |
| 729 | `updateStudentUI()` | `src/calendar/student-calendar.js` |
| 731–738 | `batchBlockAction()` | `src/calendar/block-actions.js` |
| 741–842 | `submitReservation()` | `src/reservations/reservations.js` |
| 844 (aprox.) | bind `submit-request-btn` | `src/views/student-view.js` |
| 848 | `state.professorsCache = state.professorsCache \|\| {}` (inicialización tardía) | `src/state.js` (declarar en inicial) |
| 850–933 | `listenAdminPending()` | `src/reservations/reservations.js` |
| 935–941 | `admAct()` | `src/reservations/reservations.js` |
| 943–957 | `rejectReq()` | `src/reservations/reservations.js` |
| 958 | `deleteReservation()` | `src/reservations/reservations.js` |
| 961–1020 | `openAttendanceModal()`, `setAttendance()` | `src/reservations/attendance.js` |
| 1022–1025 | `showView()` | `src/utils/dom.js` (fusionado de view-router.js) |
| 1026 | `showMessage()` | `src/utils/notify.js` |
| 1028–1041 | `resetState()` | `src/state.js` |
| 1043–1046 | `renderMatrix()` | `src/calendar/block-actions.js` |
| 1047–1067 | `executeRecurringBlock()` | `src/calendar/block-actions.js` |
| 1073–1075 | `editingGroupData`, `editingGroupId`, `editingMemberIndex` | `src/groups/group-details.js` (módulo-privadas) |
| 1077–1264 | Edición profunda de grupos (open, render, save, delete, add) | `src/groups/group-details.js` |
| 1268–1437 | Reportes (openReportModal, toggleAllCourses, executeReport) | `src/reports/reports.js` |
| 1442–1674 | HTML vistas + modales | Queda en `index.html` (sin onclick/onsubmit inline) |

> [!IMPORTANT]
> **`professorsCache` Y `weeklyLimit`** son propiedades de `state` añadidas ad-hoc en runtime (no en la declaración inicial L128-132).
> - `professorsCache`: se usa en L910 y se inicializa defensivamente en L848; `resetState()` (L1039) la resetea.
> - `weeklyLimit`: se asigna en `setupSession` L229 desde `groupData.weeklyLimit`, pero NO aparece en `state` inicial ni en `resetState`.
>
> El módulo `state.js` debe incluir AMBOS en la declaración inicial:
> ```javascript
> let state = {
>   user: null, role: null, courseId: null, groupId: null, groupName: null,
>   currentViewCourse: null, weekOffset: 0, selectedSlots: [],
>   coursesCache: {},
>   professorsCache: {},   // ← FALTANTE en definición inicial, presente en resetState
>   weeklyLimit: 4        // ← FALTANTE en definición inicial Y en resetState; default seguro
> };
> ```
> Y `resetState()` debe resetear `weeklyLimit` también (actualmente L1028-1041 no lo hace — bug latente).

---

## 5. Inventario de onclick / onsubmit a migrar

> [!CAUTION]
> **Correcciones v2**: el inventario original tenía errores. Los conteos reales (verificados con `Select-String -Path index.html -Pattern 'onclick='/onsubmit=`) son:
> - `onclick=` occurrences: **38** (en 35 líneas únicas; 3 líneas tienen 2 onclick)
> - `onsubmit=` occurrences: **7** (no 6 — faltaba `executeRecurringBlock` en L1502)
> - **Total puntos únicos de migración: ~45** (no ~54)
> - **3 handlers FALTANTES** en el v1: L1502 (`executeRecurringBlock` onsubmit), L1502 botón Cancelar close recurring, L1504 botón × close attendance
>
> La sobreestimación del v1 (~54 vs ~45 real) se debía a: (1) conteo duplicado de líneas que tienen 2 onclick, (2) asumir 13 classList inline cuando hay 11, (3) no verificar que algunos onclick en template literals aparecen en la misma línea (1006-1007 cuentan como 2 pero son 2 botones en la misma línea).

### 5.1 onclick en HTML estático (modales, headers, navegación)

| Línea | Handler | Tipo | Módulo destino |
|-------|---------|------|---------------|
| 1456 | `window.togglePassword('login-password',this)` | onclick window.* | `src/views/login-view.js` |
| 1457 | `window.openResetModal()` | onclick window.* | `src/views/login-view.js` |
| 1466 | `window.closeResetModal()` | onclick window.* | `src/views/login-view.js` |
| 1467 | `window.closeChangePasswordModal()` | onclick window.* | `src/auth/auth-ui.js` |
| 1470 | `window.openChangePasswordModal()` (admin header) | onclick window.* | `src/views/admin-view.js` |
| 1470 | `window.handleLogout()` (admin header) | onclick window.* | `src/views/admin-view.js` |
| 1474 | `window.switchTab('calendar')` | onclick window.* | `src/views/admin-view.js` |
| 1475 | `window.switchTab('courses')` | onclick window.* | `src/views/admin-view.js` |
| 1481 | `window.openReportModal()` | onclick window.* | `src/views/admin-view.js` |
| 1484 | `document.getElementById('recurring-modal').classList.remove('hidden')` | inline classList | `src/views/admin-view.js` o `src/modals/modal-utils.js` |
| 1495 | `window.openCreateCourseModal()` | onclick window.* | `src/views/admin-view.js` |
| 1502 | `document.getElementById('recurring-modal').classList.add('hidden')` (Cancelar) | inline classList | `src/modals/modal-utils.js` (vía `data-close-modal`) |
| 1504 | `document.getElementById('attendance-modal').classList.add('hidden')` (×) | inline classList | `src/modals/modal-utils.js` (vía `data-close-modal`) |
| 1506 | `document.getElementById('modal-course').classList.add('hidden')` | inline classList | `src/modals/modal-utils.js` (vía `data-close-modal`) |
| 1508 | `document.getElementById('modal-group-manage').classList.add('hidden')` | inline classList | `src/modals/modal-utils.js` (vía `data-close-modal`) |
| 1508 | `window.addGroup()` | onclick window.* | `src/groups/groups.js` |
| 1511 | `window.openChangePasswordModal()` (student header) | onclick window.* | `src/views/student-view.js` |
| 1511 | `window.handleLogout()` (student header) | onclick window.* | `src/views/student-view.js` |
| 1519 | `document.getElementById('success-modal').classList.add('hidden')` | inline classList | `src/modals/modal-utils.js` (vía `data-close-modal`) |
| 1529 | `document.getElementById('modal-group-details').classList.add('hidden')` | inline classList | `src/modals/modal-utils.js` (vía `data-close-modal`) |
| 1541 | `window.saveGroupBasicInfo()` | onclick window.* | `src/groups/group-details.js` |
| 1561 | `window.saveLeaderInfo()` | onclick window.* | `src/groups/group-details.js` |
| 1592 | `window.addNewMember()` | onclick window.* | `src/groups/group-details.js` |
| 1634 | `document.getElementById('modal-edit-course').classList.add('hidden')` | inline classList | `src/modals/modal-utils.js` (vía `data-close-modal`) |
| 1644 | `document.getElementById('modal-report').classList.add('hidden')` | inline classList | `src/modals/modal-utils.js` (vía `data-close-modal`) |
| 1665 | `document.getElementById('modal-report').classList.add('hidden')` | inline classList | `src/modals/modal-utils.js` (vía `data-close-modal`) |

**Subtotales onclick HTML estático: 26** (15 window.* + 11 inline classList)

### 5.2 onclick generados dinámicamente en template literals (JS)

| Línea | Handler | Riesgo XSS | Módulo destino |
|-------|---------|-----------|---------------|
| 261 | `onclick="window.openEditCourseModal('${d.id}')"` | ⚠️ id sin escapeAttr | delegation en `src/courses/courses-list.js` |
| 271 | `onclick="window.openCourseManager('${d.id}')"` | ⚠️ id sin escapeAttr | delegation en `src/courses/courses-list.js` |
| 572 | `onclick="window.openGroupDetails('${d.id}')"` | ⚠️ id sin escapeAttr | delegation en `src/groups/groups.js` |
| 582 | `onclick="window.deleteGroup('${d.id}')"` | ⚠️ id sin escapeAttr | delegation en `src/groups/groups.js` |
| 927 | `onclick="window.admAct('${r.id}',true,'${escapeHtml(r.date)}',${r.hour},'${r.groupName}')"` | 🔴 **CRÍTICO**: `r.groupName` y `r.id` sin escapeAttr | delegation en `src/reservations/reservations.js` |
| 928 | `onclick="window.rejectReq('${r.id}')"` | ⚠️ id sin escapeAttr | delegation en `src/reservations/reservations.js` |
| 991 | `onclick="window.deleteReservation('${res.id}')"` | ⚠️ id sin escapeAttr | delegation en `src/reservations/attendance.js` |
| 1006 | `onclick="window.setAttendance('${res.groupName}','${escapeHtml(res.date)}','${st.cedula}',false,this)"` | 🔴 **CRÍTICO**: `res.groupName` y `st.cedula` (PII) sin escapeAttr | delegation en `src/reservations/attendance.js` |
| 1007 | `onclick="window.setAttendance('${res.groupName}','${escapeHtml(res.date)}','${st.cedula}',true,this)"` | 🔴 **CRÍTICO**: idem L1006 | delegation en `src/reservations/attendance.js` |
| 1045 | `this.classList.toggle('selected')` (matrix cells en renderMatrix) | No | `src/calendar/block-actions.js` |
| 1128 | `window.saveMemberChange(${index})` | No (index es Number) | delegation en `src/groups/group-details.js` |
| 1129 | `window.cancelMemberEdit()` | No | delegation en `src/groups/group-details.js` |
| 1144 | `window.enableMemberEdit(${index})` | No (index es Number) | delegation en `src/groups/group-details.js` |
| 1145 | `window.deleteMember(${index})` | No (index es Number) | delegation en `src/groups/group-details.js` |

**Subtotales onclick template literal: 14** (13 window.* + 1 classList toggle)

### 5.3 onsubmit en formularios (HTML estático)

| Línea | Handler | Módulo destino |
|-------|---------|---------------|
| 1451 | `window.handleLogin(event)` | `src/views/login-view.js` |
| 1466 | `window.sendResetLink(event)` | `src/views/login-view.js` |
| 1467 | `window.handleChangePassword(event)` | `src/auth/auth-ui.js` |
| 1502 | `window.executeRecurringBlock(event)` | `src/calendar/block-actions.js` |
| 1506 | `window.createCourse(event)` | `src/courses/courses.js` |
| 1609 | `window.saveCourseChanges(event)` | `src/courses/courses.js` |
| 1648 | `window.executeReport(event)` | `src/reports/reports.js` |

> [!WARNING]
> `executeRecurringBlock` (L1502) fue **omitido en v1 del plan** y es el 7º onsubmit. El plan original decía 6.

**Subtotales onsubmit: 7**

### 5.4 Resumen de conteo

| Categoría | Cantidad v2 (real) | Cantidad v1 (plan original) | Delta |
|-----------|-------------------|-----------------------------|-------|
| `onclick` en HTML estático (window.*) | 15 | ~20 | -5 |
| `onclick` en HTML estático (inline classList) | 11 | ~13 | -2 |
| `onclick` en template literals JS (window.*) | 13 | ~15 | -2 |
| `onclick` en template literals JS (classList) | 1 | 0 (incluido en classList general) | +1 |
| `onsubmit` en formularios | 7 | 6 | +1 |
| **Total occurrences handler inline** | **47** | **~54** | **-7** |
| **Total puntos únicos de migración** | **45** | **~54** | **-9** |

> La diferencia se explica por: (a) conteos del v1 redondeaban cada categoría hacia arriba, (b) el v1 no detectó que algunos onclick en template literal comparten la misma línea (1006-1007), (c) el v1 añadió classList inline extra que no existen. La columna "Plan original" de la [sección 5.2](#52-onclick-generados-dinámicamente-en-template-literals-js) usaba nombres de variable incorrectos — usaba `${i}` en lugar del `${index}` real.

### 5.5 Patrones ad-hoc adicionales (NO onclick/onsubmit inline, REQUIEREN MIGRACIÓN IGUAL)

Estos no se cuentan en los 45 puntos de migración inline pero deben migrarse a delegation:

| Línea | Patrón | Descripción | Módulo destino |
|-------|--------|-------------|---------------|
| 290-293 | `btnPrev.onclick = () => { ... }` | Admin prev/next week buttons | `src/views/admin-view.js` |
| 305 | `infoBtn.onclick = () => openAttendanceModal(...)` | Admin attendance button | `src/calendar/admin-calendar.js` |
| 325 | `btn.onclick = (e) => handleAdminClick(e, btn)` | Calendar cell clicks (closure sobre `btn`) | `src/calendar/admin-calendar.js` |
| 343-344 | `btn.onclick = () => { state.weekOffset++ }` | Student prev/next week | `src/views/student-view.js` |
| 356 | `btn.onclick = (e) => handleStudentClick(e, btn)` | Student calendar cell clicks (closure) | `src/calendar/student-calendar.js` |
| 844 | `document.getElementById('submit-request-btn').onclick = window.submitReservation` | Submit request button | `src/views/student-view.js` |

**Total adicional: ~6 closures sobre `btn`** que el patrón `data-*` del plan no cubre explícitamente. La migración obliga a inyectar datos del slot como dataset.

### 5.6 Colaboradores no-window.* que requieren wrapping

| Referencia global | Línea | Problema | Solución |
|------------------|-------|----------|----------|
| `window.alert` (override) | 147-160 | Reemplaza `alert()` nativo por SweetAlert2 | `main.js` mantiene puente `window.alert = notify.alert` hasta Fase 7 |
| `window.Swal` | varias | Dependencia implícita del CDN SweetAlert2 | `swal-bootstrap.js` importa como módulo y expone `window.Swal` temporal |
| `window.XLSX` | 1310+ | Dependencia implícita del CDN SheetJS | `reports.js` usa `import * as XLSX from 'xlsx'` (npm) o mantiene CDN con comentario |

---

## 6. Estrategia de migración onclick → event delegation

### Patrón para template literals (onclick dinámicos con interpolación)

```javascript
// ❌ ANTES (XSS-izable si groupName contiene comilla):
`<button onclick="window.admAct('${r.id}',true,'${r.date}',${r.hour},'${r.groupName}')">`

// ✅ DESPUÉS:
`<button data-action="approve" data-id="${escapeAttr(r.id)}" data-date="${escapeAttr(r.date)}" data-hour="${r.hour}" data-group="${escapeAttr(r.groupName)}">`
```

Con listener delegado registrado una sola vez por módulo:

```javascript
// src/reservations/reservations.js
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="approve"]');
  if (!btn) return;
  admAct(btn.dataset.id, true, btn.dataset.date, parseInt(btn.dataset.hour), btn.dataset.group);
});
```

### Patrón para HTML estático (botones fijos)

```javascript
// src/views/admin-view.js — se registra en DOMContentLoaded
document.getElementById('tab-btn-cal')?.addEventListener('click', () => switchTab('calendar'));
```

### Patrón para formularios (onsubmit)

```javascript
// src/views/login-view.js
document.getElementById('login-form')?.addEventListener('submit', handleLogin);
// Requiere añadir id="login-form" al <form> en index.html
```

### Patrón para cierre de modales (classList inline)

```javascript
// src/modals/modal-utils.js
export function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}
// Botones de cierre usan data-close-modal="modal-id"
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-close-modal]');
  if (btn) closeModal(btn.dataset.closeModal);
});
```

---

## 7. Fases de ejecución

### PRERREQUISITO BLOQUEANTE — Corregir `firestore.rules` ANTES de Fase 0

> [!CAUTION]
> **Las `firestore.rules` actuales L129-132 bloquean `batchBlockAction` y `executeRecurringBlock`**. Exigen `isStudent() && isValidReservationCreate()` (status==pending, userId==auth.uid) para crear documentos en `reservations`. Pero `batchBlockAction` (L735) y `executeRecurringBlock` (L1060) escriben documentos con `{status:'blocked', userId:'ADMIN'}`. La función de bloqueo está **rota en producción**.
>
> **Si no se corrige esto, el refactor migrará un bug de producción.**
>
> **Corrección mínima en `firestore.rules`** (añadir entre el bloque create student y el bloque update admin):
> ```javascript
> match /reservations/{docId} {
>   // existing rules...
>   allow create: if isAdmin()
>                 && request.resource.data.keys().hasAll(['status','createdAt','date','hour'])
>                 && request.resource.data.status == 'blocked'
>                 && request.resource.data.userId == 'ADMIN';
> }
> ```
> También corregir la regla de lectura para estudiantes: añadir `resource.data.groupName == get(/student_directory/$(request.auth.token.email)).data.groupName` o similar para evitar la fuga de datos (riesgo #9).

### Fase 0 — Setup del entorno (una vez corregidas las rules)

**Objetivo**: Esqueleto de proyecto sin romper producción.

**Tareas**:
- [x] Crear **branch `refactor/modular`** (NO trabajar en `master`). El CI solo dispara en push a `master`
- [x] Crear `package.json` con devDependencies: `vitest ^1.6.0`, `jsdom ^24.0.0`, `tailwindcss`
- [x] Crear `vitest.config.js` con `environment: 'jsdom'` y alias `@/ → ./src/`
- [x] Crear `tailwind.config.js` con `content: ['./index.html', './src/**/*.js']`
- [x] Crear `src/styles/tailwind-input.css` con directivas `@tailwind` + CSS custom (líneas 17-117)
- [x] Añadir scripts al `package.json`:
  - [x] `"build:css": "tailwindcss -i src/styles/tailwind-input.css -o styles.css --minify"`
  - [x] `"test": "vitest run"`
  - [x] `"test:watch": "vitest"`
  - [x] `"precommit": "npm run build:css && git add styles.css"` (para husky o pre-commit)
- [x] Actualizar `.gitignore`: añadir `node_modules/`, `*.local`
- [x] Actualizar `firebase.json` ignore: añadir `**/*.test.js`, `vitest.config.js`, `package.json`, `package-lock.json`, `src/**`, `tailwind.config.js`, `tests/**`
- [x] `npm install` → generar `package-lock.json`
- [x] Ejecutar `npm run build:css` → generar `styles.css` (30KB minificado)
- [x] Commit Fase 0 en `refactor/modular` (commit `f2b0f70`)
- [x] **Verificar**: `index.html` funciona idéntico, `master` sin cambios

> [!WARNING]
> **Atomic commit**: parcial. Fase 0 NO toca `index.html`, solo añade archivos. Sí es seguro commitear en `refactor/modular` sin romper prod.

**Estado**: `✅ Completada`

---

### Fase 1 — Extracción de utilidades puras (cero dependencias DOM/Firebase)

**Objetivo**: Funciones sin dependencias. Tests validan pipeline Vitest.

**Tareas**:
- [x] Crear `src/utils/escape.js` con `escapeHtml` (L136-144) + `escapeAttr()` — escapa `'`, `"`, `` ` ``, `$`, `<`, `>`, `&`
- [x] Crear `src/utils/dates.js` con `getWeekDays`, `formatDateYYYYMMDD`, `isPastDate` (L698-700)
- [x] Crear `src/courses/course-utils.js` con `buildCourseId(subject, parallel)` (extraído de 437-446)
- [x] Escribir `tests/utils/escape.test.js` — 15 tests: comillas, backticks, `<script>`, null, objetos
- [x] Escribir `tests/utils/dates.test.js` — 13 tests: cruce de semana, formato, isPastDate con timezone
- [x] Escribir `tests/courses/course-utils.test.js` — 7 tests: espacios, mayúsculas, símbolos, caracteres especiales
- [x] En `index.html`, reemplazar funciones inline por `import` desde módulos nuevos + `window.escapeAttr` para onclick
- [x] Ejecutar `npm test` — 35/35 pasan ✅

> [!WARNING]
> **Atomic commit**: NO — toca `index.html` (importa los módulos). El cambio es pequeño y reversible (quitar 3 funciones y añadir imports). Verificar que la app funciona antes de commitear.

**Estado**: `✅ Completada`

---

### Fase 2 — Extracción del núcleo (state + firebase-config + notify + dom + swal-bootstrap)

**Objetivo**: Infraestructura central modularizada.

**Tareas**:
- [x] Crear `src/firebase-config.js` — inicialización (L119-127). Export `db`, `auth`, `RESERVATIONS_COLLECTION`
- [x] Crear `src/state.js` — `state` (L128-132 + **`professorsCache: {}` y `weeklyLimit: 4`**), `resetState` (L1028-1041) incluye reset de `weeklyLimit`, `clearListeners` (L169-172)
- [x] Crear `src/utils/notify.js` — export `alert()` wrapper SweetAlert2 + `showMessage()` (L1026)
- [x] Crear `src/utils/dom.js` — `el(id)`, `showHide(ids, showId)`, `toggleHidden(id)`, `showView(name)` (fusionado de L1022-1025, elimina `view-router.js`)
- [x] Crear `src/utils/swal-bootstrap.js` — importa SweetAlert2 global, expone `window.Swal` como puente temporal
- [x] Crear `src/main.js` — bootstrap: `DOMContentLoaded` (L162-167) → importa módulos, inicializa, pone `window.alert = notify.alert`
- [x] En `index.html`, añadir `<script type="module" src="/src/main.js"></script>` antes del script inline
- [x] En `index.html`, eliminar imports de utilidades y alert override del script inline (main.js los provee)
- [x] **Eliminar** `src/view-router.js` del plan (se fusionó en `utils/dom.js`)
- [x] Verificar que la app funciona idéntico (login, vistas, modales)

> [!WARNING]
> **Atomic commit**: NO — Fase 2 es la migración más grande (reemplaza todo el script inline por import). Pero es el punto de no retorno mínimo: después de esta fase, el resto son extracciones de módulos desde `main.js`/`index.html`. Verificar exhaustivamente con `firebase serve` local.

**Estado**: `✅ Completada`

---

### Fase 3 — Extracción de auth

**Objetivo**: Auth aislado + primera migración onclick→delegation.

**Tareas**:
- [x] Crear `src/auth/auth.js` — `initAuthListener` (L174-202), `setupSession` (L204-239). Añadir unsubscribe del `onAuthStateChanged` (L174 no tiene unsubscribe actualmente — guardar la referencia)
- [x] Crear `src/auth/auth-ui.js` — `handleLogin` (L382-395), `handleLogout` (L396), `togglePassword` (L397), modales reset/change password (L398-403)
- [x] Crear `src/views/login-view.js` — bind formulario login onsubmit, botón togglePassword, openResetModal, sendResetLink, closeResetModal
- [x] **Añadir `id="login-form"` al `<form>`** del HTML login (L1451)
- [x] Migrar onclicks de login/reset/change-password a event delegation con data-action (handle-logout, open-change-password-modal, close-change-password-modal, open-reset-modal, close-reset-modal)
- [x] Añadir data-action delegation en `main.js` + bind change-password-form
- [x] Eliminar funciones inline de auth del script (handleLogin, handleLogout, togglePassword, openResetModal, closeResetModal, sendResetLink, openChangePasswordModal, closeChangePasswordModal, handleChangePassword)

> [!NOTE]
> `initAuthListener` y `setupSession` permanecen en el inline script (llaman a `loadAdminDashboard` y `setupStudentView` que aún no están extraídas). Se extraerán en Fase 4-5.

**Estado**: `✅ Completada`

---

### Fase 4 — Extracción de cursos, grupos, reportes y reservas

**Objetivo**: Módulos de cursos, grupos, reportes y reservas + event delegation + **corregir listeners huérfanos**.

**Tareas**:
- [x] Crear `src/courses/courses-list.js` — grid de cursos + select profesores + clearCoursesListener
- [x] Crear `src/courses/courses.js` — createCourse, openEditCourseModal, saveCourseChanges, openCreateCourseModal
- [x] Crear `src/groups/groups.js` — openCourseManager, addGroup, deleteGroup + clearGroupsListener
- [x] Crear `src/groups/group-details.js` — edición profunda de grupos (miembros, líder, nombre)
- [x] Crear `src/groups/group-utils.js` — lookupMembersByGroupName helper
- [x] Crear `src/reports/reports.js` — openReportModal, toggleAllCourses, executeReport
- [x] Crear `src/reservations/reservations.js` — batchBlockAction, submitReservation, admAct, rejectReq, deleteReservation, openAttendanceModal, setAttendance, executeRecurringBlock
- [x] Migrar onclicks → data-action (tabs, modals, grupos, reportes, asistencia)
- [x] Migrar onsubmits → data-action (createCourse, saveCourseChanges, executeRecurringBlock, executeReport)
- [x] Strip inline script: eliminadas ~1100 líneas, quedan solo funciones de rendering calendario
- [x] Event delegation centralizado en main.js (click + submit)
- [x] Eliminar doble init Firebase (CDN + npm simultáneos)
- [ ] `tests/groups/group-utils.test.js` — pendiente

> **Nota**: Fase 4 absorbió partes de Fase 5 (reservations) y Fase 6 (reports) porque los módulos estaban acoplados.

**Estado**: `✅ Completado` — commit `d3ebaeb`

---

### Fase 5 — Extracción de calendario

**Objetivo**: Calendario admin + student (lo más acoplado). Reservas y reports ya extraídos en Fase 4.

**Tareas**:
- [x] Crear `src/calendar/calendar.js` — módulo único con todo el calendario (renderAdminCalendar, renderStudentCalendar, renderCalendarHeader, listenAdminPending, renderMatrix, handleAdminClick, handleStudentClick, updateAdminActionBox, updateStudentUI, setupAdminCalendarLogic, setupStudentView, switchTab)
- [x] `initCalendar(db, RESERVATIONS_COLLECTION)` — inicializa referencias Firestore dentro del módulo
- [x] `clearCalendarListeners()` — limpia onSnapshot de reservations y pending, integrada en logout
- [x] Migrar `listenAdminPending` (profName double lookup via coursesCache + professorsCache)
- [x] Migrar `renderMatrix` (recurring block grid con inline classList toggle)
- [x] Migrar `switchTab` (tab switching admin)
- [x] Exponer `window._setupAdminCalendarLogic`, `window._setupStudentView`, `window.switchTab` desde main.js
- [x] Eliminar todo el script inline de index.html (224 líneas → 0)
- [x] Logout integra `clearCalendarListeners()` junto con `clearListeners()` de state.js
- [ ] Escribir `tests/calendar/slots.test.js` — pendiente

> [!NOTE]
> Se decidió un módulo único (`calendar/calendar.js`) en lugar de los 5 archivos planificados (`header.js`, `slots.js`, `admin-calendar.js`, `student-calendar.js`, `block-actions.js`) porque las funciones están altamente acopladas (comparten `state.selectedSlots`, `renderCalendarHeader`, listeners `onSnapshot`, variables `_unsubscribe*`). Separarlas creaba imports circulares sin beneficio real.

**Estado**: `✅ Completado` — commit pendiente

---

### Fase 6 — Cleanup final + tests

**Objetivo**: Tests faltantes + limpieza total del HTML.

**Tareas**:
- [x] Crear `src/reports/reports.js` — ya creado en Fase 4
- [x] Crear `src/reservations/reservations.js` — ya creado en Fase 4
- [x] Escribir `tests/groups/group-utils.test.js` — 5 tests: early return, Firebase path, caché hit/miss, clearCache
- [x] Escribir `tests/reports/reports.test.js` — 9 tests: sortReportData (compuesto, inmutabilidad) + buildReportRows
- [x] Escribir `tests/calendar/slots.test.js` — 9 tests: past, blocked, my-approved, my-pending, full, partial, free, mixed
- [x] Cleanup `index.html`:
  - [x] Quitar `<style>` embebido → `<link rel="stylesheet" href="/styles.css">`
  - [x] Quitar `<script src="https://cdn.tailwindcss.com">` (reemplazado por styles.css)
  - [x] Mantener CDNs de: SweetAlert2, SheetJS, Google Fonts, FontAwesome
- [x] `grep -rnE 'onclick|onsubmit' index.html` → 0 matches
- [x] `window.alert = notify.alert` puente temporal se mantiene (aún hay código que usa `alert()`)
- [x] Extraídas funciones puras: `classifySlot` (calendar.js), `sortReportData` + `buildReportRows` (reports.js)
- [x] Añadido caché LRU en `lookupMembersByGroupName` + `clearGroupUtilsCache()`
- [x] Tests: 58/58 pasan (6 suites)

**Estado**: `✅ Completada`

---

### Fase 7 — Smoke E2E + CI + merge a master + finalización

**Objetivo**: Validar todo funciona, integrar tests en CI, mergear a master.

**Tareas pre-merge**:
- [ ] `firebase serve` local — verificar ES modules se sirven con MIME correcto
- [ ] Smoke test: login admin (calendario + cursos + grupos + reportes + export Excel)
- [ ] Smoke test: login student (calendario + solicitud + cancelación)
- [ ] Smoke test: aprobar/rechazar reserva como admin
- [ ] Smoke test: marcar asistencia
- [ ] Smoke test: bloqueo manual y recurrente (verificar que rules corregidas lo permiten)
- [ ] Smoke test: todos los modales abren/cierran desde botones y tecla Escape (focus trap básico)
- [ ] Smoke test: logs de consola sin errores (atención a imports dinámicos y MIME)

**Tareas CI**:
- [ ] Actualizar `package.json` scripts: `"test:ci": "vitest run --reporter=verbose"`
- [ ] Actualizar `.github/workflows/firebase-hosting-github.yml`:
  - [ ] Añadir step `actions/setup-node@v4` con `node-version: '20'` y `cache: 'npm'`
  - [ ] Añadir `- name: Run tests` → `run: npm ci && npm test`
  - [ ] Añadir `if: success()` explícito en el step `action-hosting-deploy`
  - [ ] Añadir `- name: Verify Tailwind CSS is fresh` → `run: npm run build:css && git diff --exit-code styles.css` (detecta drift)
- [ ] Verificar CI pasa en `refactor/modular` (GitHub Actions con trigger temporal `pull_request`)

**Merge a master**:
- [ ] Crear PR de `refactor/modular` → `master`
- [ ] Validar firestore.rules corregidas en master
- [ ] Merge y observar deploy en Firebase Hosting
- [ ] Smoke post-deploy en producción

**Estado**: `⬜ Pendiente`

---

## 8. Riesgos y mitigaciones

> [!WARNING]
> **Correcciones v2**: añadidos riesgos #10 (bloqueador rules), #11 (fuga datos estudiantes), #12 (closures btn), #13 (Tailwind drift), #14 (merge a master directo). #7 y #8 actualizados con conteos reales.

| # | Riesgo | Probabilidad | Impacto | Mitigación | Estado |
|---|--------|-------------|---------|------------|--------|
| 1 | ES modules requieren MIME `application/javascript` | Baja | Alto | Firebase Hosting lo hace por defecto. Smoke test con `firebase serve` antes de merge a master | `⬜ Pendiente` |
| 2 | `window.alert` override: módulos no migrados usan `alert()` | Media | Bajo | `main.js` mantiene `window.alert = notify.alert` como puente hasta Fase 6 | `⬜ Pendiente` |
| 3 | Listener sin unsubscribe en `openCourseManager` (L545) | Alta (bug real) | Bajo (memory leak lento) | ✅ **SE CORRIGE en Fase 4** (v1 lo documentaba como deuda, v2 lo corrige) | ✅ Planificado |
| 4 | Listenere sin unsubscribe en `loadAdminDashboard` (L246) | Alta (bug real) | Bajo (memory leak lento) | ✅ **SE CORRIGE en Fase 4** (nuevo, no cubierto en v1) | ✅ Planificado |
| 5 | `onAuthStateChanged` sin unsubscribe guardado (L174) | Media | Bajo (leak en logout/login sin reload) | ✅ **SE CORRIGE en Fase 3** guardando la referencia de unsubscribe | ✅ Planificado |
| 6 | Vitest no parsea URLs `https://www.gstatic.com/...` | Alta | Bajo | Tests solo importan módulos puros sin Firebase. Para Firebase: `vi.mock('@/firebase-config')` | `⬜ Pendiente` |
| 7 | Cache stale en `lookupMembersByGroupName` | Media (bug preexistente) | Bajo | Fase 6 unifica cache | `⬜ Pendiente` |
| 8 | Commit grande rompe producción | Baja | Alto | Cada fase = 1 commit atómico en `refactor/modular`. Verificar app con `firebase serve` después de cada fase. Merge a master SOLO al finalizar Fase 7 | `⬜ Pendiente` |
| 9 | Subestimación de onclicks a migrar | ✅ Corregido en v2 | — | Inventario actualizado en v2: **45 puntos únicos** (ver sección 5.4) | ✅ Corregido |
| 10 | 🔴 **Reglas Firestore bloquean bloqueo admin** (L129-132) | Alta (bug real) | **Crítico** (feature de bloqueo rota en producción) | **Resolver ANTES de Fase 0** (ver prerrequisito bloqueante) | ⬜ **BLOQUEADOR** |
| 11 | 🟠 **Fuga de datos entre estudiantes** (Rules L122-126) | Alta | Medio (estudiante puede leer reservas de otros grupos) | Corregir rules: scope `reservations` read por `resource.data.groupName == get(student_directory/...).groupName` | `⬜ Pendiente` |
| 12 | 🟡 **Closures sobre `btn` en calendarios no macheables 1:1 con delegation** (L325, L356) | Alta | Medio (requiere refactor mayor de handlers) | Migrar a `data-hour/dataset` en las celdas del calendario y leer en el handler delegado. Documentar en Fase 5 | `⬜ Pendiente` |
| 13 | 🟡 **Tailwind drift**: clase nueva en src/ no existe hasta recompilar | Media | Medio | Pre-commit hook que ejecuta `npm run build:css`; CI verifica `git diff --exit-code styles.css`. Sin esto no commitar | `⬜ Pendiente` |
| 14 | 🔵 **Trabajar sobre `master` despliega a live a medio refactor** | Baja | Alto | Branch `refactor/modular`. CI solo dispara en `master`. Merge manual al final | ✅ Resuelto en decisión #6 v2 |
| 15 | 🔵 `window.location.reload()` en `handleLogout` mata estado SPA | Baja | Bajo | No cambiar en este refactor (comportamiento legacy mantenido) | 📝 Documentado |
| 16 | 🔵 `firebase.json` `"public": "."` + `src/**/*.js` sin bundler infla deploy | Baja | Bajo | Aceptable; no hay secretos en JS cliente. Si se añade bundler en futuro, añadir ignore | 📝 Documentado |

---

## 9. Criterios de validación

Al finalizar **todas las fases**, estos deben cumplirse:

### Criterios de código (depurados v2)

```bash
# index.html solo contiene markup (sin CSS inline, sin JS, sin onclick/onsubmit inline)
# Debe contener solo: <link href="/styles.css"> + <script type="module" src="/src/main.js">

# src/main.js < 50 líneas (solo bootstrap)
wc -l src/main.js  # → < 50

# Sin ASIGNACIONES a window.* en código de producción (lecturas como window.location son OK)
grep -rn 'window\.\w\+\s*=' src/  # → 0 matches (ninguna asignación new a window)

# Sin innerHTML/insertAdjacentHTML no sanitizado
grep -rnE 'innerHTML|insertAdjacentHTML|outerHTML' src/ | grep -v 'escapeHtml\|escapeAttr'
# → 0 matches (toda inserción usa escapeHtml/escapeAttr)

# Sin Swal ni XLSX como global (contar importadores)
grep -rn "Swal\." src/ --include="*.js"  # → matches solo en swal-bootstrap.js
grep -rn "XLSX\." src/ --include="*.js"  # → matches solo en reports.js (con import explícito)

# Listeners firestore correctos: contar que no haya onSnapshot sin unsubscribe
grep -rn "onSnapshot\|onAuthStateChanged" src/ --include="*.js"  # → cada uno debe estar en una variable que se unsubscriba

# Tests pasan
npm test  # → exit code 0
```

### Criterios de cobertura mínima de tests

| Módulo | Casos mínimos |
|--------|---------------|
| `utils/escape` | escapeHtml + escapeAttr con XSS payloads (comillas, backticks, `<script>`, null, `$`) |
| `utils/dates` | getWeekDays cruce de semana, formatDateYYYYMMDD, isPastDate |
| `courses/course-utils` | buildCourseId normalización (espacios, mayúsculas, símbolos) |
| `groups/group-utils` | lookupGroupMembers caché hit/miss |
| `calendar/slots` | classifySlot: past, blocked, partial, full, mine pending/approved (con state inyectado) |
| `reports/reports` | sorting, buildRow |

### Criterios de deploy

- [ ] `firebase serve` local: app funciona idéntico al estado actual
- [ ] `firebase deploy --only hosting`: deploy exitoso sin build
- [ ] Login → Admin dashboard (calendario + cursos + reportes + bloqueo) → funciona
- [ ] Login → Student dashboard (calendario + solicitudes + cancelación) → funciona
- [ ] Todos los modales abren y cierran correctamente (incluyendo botones × y Cancelar)
- [ ] Exportar reporte Excel funciona
- [ ] Sin errores en consola del navegador
- [ ] CI pasa en `refactor/modular` antes del merge

---

## 10. Registro de sesiones

> Actualizar esta sección después de **cada sesión de trabajo**.

### Sesión 1 — 2026-07-09

- **Agente**: Antigravity (Claude Opus 4.6)
- **Actividad**: Evaluación del plan de refactorización
- **Resultado**:
  - Plan evaluado y aprobado con 8 correcciones (v1)
  - Correcciones documentadas:
    1. Conteo onclick/onsubmit actualizado (38 → ~54 puntos de migración)
    2. `professorsCache` añadido a estado inicial
    3. `renderCalendarHeader` movido de `dates.js` a `admin-calendar.js` (usa DOM)
    4. `vitest.config.ts` → `vitest.config.js` (no hay TypeScript)
    5. `onsubmit` de formularios incluidos en el inventario (6 formularios)
    6. `showMessage` mapeado a `notify.js`
    7. CI workflow necesita `actions/setup-node@v4`
    8. `tailwind-input.css` y `tailwind.config.js` añadidos a ignores de firebase.json
  - Creado `plan.md` como documento vivo
- **Decisiones**: Ninguna nueva
- **Siguiente paso**: Ejecutar Fase 0 (setup de entorno)

### Sesión 1b — 2026-07-09 (revisión v2 con subagentes especializados)

- **Agente**: OpenCode con 4 subagentes especializados
  - Subagente 1: Composicion física del monolito (estructura, window.*, state, listens)
  - Subagente 2: Mapeo preciso de handlers onclick/onsubmit (verificación independiente)
  - Subagente 3: Auditoría crítica del plan (Staff Engineer "Collector")
  - Subagente 4: Mapeo de flujo de datos Firebase ↔ firestore.rules (seguridad)
- **Actividad**: Corrección comprensiva del plan de refactorización
- **Hallazgos corregidos en v2**:
  1. **Conteos depurados**: 38 onclick + 7 onsubmit = **45 puntos únicos** (no ~54)
  2. **3 handlers faltantes** en el inventario original (executeRecurringBlock, close recurring, close attendance)
  3. **Bloqueador crítico**: `firestore.rules` L129-132 bloquea la función de bloqueo de administradores
  4. **Decisión #4 vs #7 contradición** (Vitest solo en dev vs CI ejecuta tests)
  5. **Decisión #6 riesgo**: trabajar sobre `master` despliega a live a medio refactor → crear `refactor/modular`
  6. **Decisión #5 riesgo**: Tailwind drift sin pre-commit hook
  7. **Estructura destino**: añadido `calendar/header.js` (evita import circular), `utils/swal-bootstrap.js`, fusionado `view-router→dom.js`, `slots.js` ya no es puro (toma state por parámetro)
  8. **`weeklyLimit`** faltaba en state inicial Y en `resetState` — bug latente
  9. **3 vectores XSS críticos** (no 1): L927, L1006, L1007 necesitan `escapeAttr`
  10. **3 `onSnapshot` huérfanos** corregidos de "deuda técnica" a "corregir en Fase 3-4"
  11. **Criterios de validación** depuados: `grep "window\."` → `grep -rn 'window\.\w\+\s*='`
  12. **Añadidos riesgos #10-#16** (rules, fugas, closures btn, Tailwind drift, branch)
- **Decisiones v2**: 8 decisiones bloqueadas reevaluadas con salvedades obligatorias
- **Estado del plan**: Subió de 4.5/10 a 7.5/10 de confidence
- **Siguiente paso**: Validar que `firestore.rules` se corrigió (riesgo #10) y comenzar Fase 0 (setup)

### Sesión 3 — Ejecución Fase 0 (09 jul 2026)
- **Commiteado**: `f2b0f70` — Fase 0: Setup entorno modular
- **Archivos creados**: `package.json`, `package-lock.json`, `vitest.config.js`, `tailwind.config.js`, `src/styles/tailwind-input.css`, `styles.css`
- **Archivos modificados**: `.gitignore` (añadido `*.local`), `firebase.json` (ignores expandidos)
- **`npm install`**: 202 packages instalados, 4 vulnerabilities (2 moderate, 1 high, 1 critical) — no bloqueante para desarrollo
- **`npm run build:css`**: `styles.css` generado (30KB minificado) en 556ms
- **`index.html` NO modificado** — produce sigue idéntica
- **`master` intacto** — sin cambios, CI no se dispara
- **`git status` limpio** — solo `plan.md` pendiente de commitear
- **Nota**: `firestore.rules` NO se corrigió en esta sesión (riesgo #10 pendiente, deferido a Fase 4-5)

### Sesión 4 — Ejecución Fase 1 (09 jul 2026)
- **Archivos creados**: `src/utils/escape.js`, `src/utils/dates.js`, `src/courses/course-utils.js`, `tests/utils/escape.test.js`, `tests/utils/dates.test.js`, `tests/courses/course-utils.test.js`
- **`index.html` modificado**: imports añadidos (L123-125), `window.escapeAttr` (L127), funciones inline eliminadas (escapeHtml, getWeekDays, formatDateYYYYMMDD, isPastDate, buildCourseId)
- **Tests**: 35/35 pasan (15 escape + 13 dates + 7 course-utils)
- **Nota**: `buildCourseId` inline en `createCourse` reemplazado por llamada a función importada

### Sesión 5 — Ejecución Fase 2 (09 jul 2026)
- **Archivos creados**: `src/firebase-config.js`, `src/state.js`, `src/utils/notify.js`, `src/utils/swal-bootstrap.js`, `src/utils/dom.js`, `src/main.js`
- **`index.html` modificado**: `<script type="module" src="/src/main.js"></script>` añadido antes del script inline; utility imports y alert override eliminados del script inline
- **Script inline restante**: mantiene Firebase imports, config, state local, DOMContentLoaded init, clearListeners, initAuthListener — las funciones inline las necesitan como variables locales
- **main.js expone globals**: `escapeHtml`, `escapeAttr`, `getWeekDays`, `formatDateYYYYMMDD`, `isPastDate`, `buildCourseId`, `showView`, `el`, `showHide`, `toggleHidden`, `RESERVATIONS_COLLECTION`, `_appState`, `_resetState`, `_clearListeners`
- **Tests**: 35/35 pasan

### Sesión 6 — Ejecución Fase 3 (09 jul 2026)
- **Archivos creados**: `src/auth/auth.js`, `src/auth/auth-ui.js`, `src/views/login-view.js`
- **`main.js` modificado**: importa auth/auth-ui/login-view, expone globals, añade delegation listeners para data-action
- **`index.html` modificado**: `id="login-form"` añadido, onclick→data-action en login/reset/change-password modals y headers (admin+student), funciones inline de auth eliminadas
- **Auth functions migradas**: handleLogin, handleLogout, togglePassword, openResetModal, closeResetModal, sendResetLink, openChangePasswordModal, closeChangePasswordModal, handleChangePassword
- **Auth functions NO migradas** (permanecen en inline): `initAuthListener`, `setupSession` — dependen de `loadAdminDashboard` y `setupStudentView` (Fase 4-5)
- **Tests**: 35/35 pasan

### Sesión 7 — Ejecución Fase 4 (09 jul 2026)
- **Archivos creados** (7): `src/courses/courses-list.js`, `src/courses/courses.js`, `src/groups/groups.js`, `src/groups/group-details.js`, `src/groups/group-utils.js`, `src/reports/reports.js`, `src/reservations/reservations.js`
- **`index.html` reducido**: de ~1616 a ~513 líneas (script inline). Se eliminaron ~1100 líneas de funciones CRUD que ahora viven en módulos
- **Inline script**: quedan solo funciones de rendering calendario (renderAdminCalendar, renderStudentCalendar, renderCalendarHeader, listenAdminPending, renderMatrix, handleAdminClick/StudentClick, updateAdminActionBox/UI, switchTab, setupAdminCalendarLogic, setupStudentView)
- **Doble init Firebase eliminado**: el inline script creaba su propia instancia CDN; main.js creaba otra npm. Ahora solo existe la de main.js
- **onclick→data-action migrados**: tabs (switch-tab), modals (close-modal, open-create-course-modal, open-report-modal, open-recurring-modal), grupos (add-group, save-group-basic-info, save-leader-info, add-new-member), formularios (create-course, save-course-changes, execute-recurring-block, execute-report), pending requests (adm-act, reject-req)
- **Event delegation**: main.js maneja click (data-action) + submit (data-action) de forma centralizada
- **Bug fix**: onSnapshot leak en loadAdminDashboard y openCourseManager (clearCoursesListener, clearGroupsListener)
- **Tests**: 35/35 pasan (sin nuevos tests aún — pendiente group-utils.test.js)
- **Commit**: `d3ebaeb`

### Sesión 8 — Ejecución Fase 5 (09 jul 2026)
- **Archivos creados**: `src/calendar/calendar.js` (402 líneas) — módulo único de calendario
- **`index.html` reducido**: de 579 a 354 líneas. Script inline completo eliminado (224 líneas → 0)
- **`main.js` modificado**: importa `initCalendar`, `setupAdminCalendarLogic`, `setupStudentView`, `switchTab`, `clearCalendarListeners` desde `calendar/calendar.js`
- **Funciones migradas**: renderCalendarHeader, renderAdminCalendar, renderStudentCalendar, setupAdminCalendarLogic, setupStudentView, switchTab, listenAdminPending, renderMatrix, handleAdminClick, handleStudentClick, updateAdminActionBox, updateStudentUI
- **Diseño**: Se optó por un módulo único en lugar de 5 archivos separados porque las funciones están acopladas (comparten state.selectedSlots, listeners onSnapshot, variables _unsubscribe*)
- **Logout**: integra `clearCalendarListeners()` junto con `clearListeners()` de state.js
- **`index.html` ahora solo contiene**: `<script type="module" src="/src/main.js"></script>` — cero JS inline
- **Tests**: 35/35 pasan (sin nuevos tests — pendiente calendar/slots.test.js)

### Sesión 9 — Ejecución Fase 6 (09 jul 2026)
- **`index.html` limpiado**: de 354 a 254 líneas. Eliminado `<style>` embebido (100 líneas) y CDN Tailwind. Reemplazado por `<link rel="stylesheet" href="/styles.css">`
- **CDNs mantenidos**: SweetAlert2, SheetJS, FontAwesome, Google Fonts
- **Tests creados**:
  - `tests/groups/group-utils.test.js` — 5 tests: early return, Firebase path, cache hit/miss, clearCache
  - `tests/reports/reports.test.js` — 9 tests: sortReportData (compuesto, inmutabilidad) + buildReportRows
  - `tests/calendar/slots.test.js` — 9 tests: past, blocked, my-approved, my-pending, full, partial, free, mixed
- **Funciones puras extraídas**:
  - `classifySlot(date, hour, reservations, userState)` en `calendar.js` — lógica de clasificación de slots
  - `sortReportData(data)` en `reports.js` — ordenamiento compuesto fecha/grupo/estudiante
  - `buildReportRows(docs, courses, cache, groupsCache)` en `reports.js` — construcción de filas de reporte
- **Cache añadido**: `lookupMembersByGroupName` ahora tiene un Map cache con `clearGroupUtilsCache()`
- **Tests finales**: **58/58 pasan** (6 suites, 23 tests nuevos + 35 existentes)
- **Verificaciones**:
  - `onclick`/`onsubmit` en `index.html`: **0 matches** ✅
  - `<style>` embebido eliminado ✅
  - Tailwind CDN eliminado ✅
  - `styles.css` reconstruido (317ms) ✅
  - `innerHTML` no sanitizado: 0 matches (todos usan escapeHtml/escapeAttr o datos seguros) ✅

### Sesión 10 — Ejecución Fase 7 (ciérre del refactor) (09 jul 2026)
- **firestore.rules corregidas**: Añadida regla `allow create: if isAdmin() && status=='blocked' && userId=='ADMIN'` para bloqueos manuales/recurrentes (PRERREQUISITO BLOQUEANTE de Fase 0)
- **CI workflow creado**: `.github/workflows/firebase-hosting-github.yml` con setup-node v20, `npm ci && npm test`, `npm run build:css && git diff --exit-code styles.css`, deploy condicional con `if: success()`
- **package.json**: Añadido script `test:ci` (`vitest run --reporter=verbose`)
- **Merge**: `refactor/modular` → `master` completado (fast-forward, 6 commits)
- **Tests finales**: **58/58 pasan** ✅
- **Estado**: **Fase 7 completa — refactor monolito→modular finalizado** 🟢

---

## 11. Deuda técnica documentada

Estos items **no se corrigen** en este refactor. Quedan como trabajo futuro.

| # | Item | Ubicación actual | Impacto | Fase futura sugerida |
|---|------|-----------------|---------|---------------------|
| 1 | (Eliminado — corregido en Fase 3/4) | — | — | — |
| 2 | Validación de límite semanal solo en cliente | `submitReservation` (L741-842) | Bypass posible | Cloud Functions |
| 3 | `apiKey` de Firebase hardcoded (público en código) | L124 | Bajo (es public API key) | Firebase App Check |
| 4 | Cache stale de `professorsCache` entre sesiones | L910 | Muestra nombre desactualizado | Invalidación por listener |
| 5 | Cache stale de `lookupMembersByGroupName` | varias ubicaciones | Mismos datos si se edita grupo | Unificar cache con TTL |
| 6 | `confirm()` nativo en `createCourse` (L450) y `deleteMember` (L1230) | L450, L1230 | Inconsistencia UX | ✅ Corregido en Fase 4 |
| 7 | FontAwesome cargado como JS bundle en vez de CSS | L13 | Performance (bloquea render) | Migrar a CSS-only |
| 8 | Sin App Check ni rate limiting | — | Abuso de API posible | Firebase App Check |
| 9 | `Swal` referenciado como global (dependencia CDN) | varias | Dependencia implícita | `swal-bootstrap.js` como puente; migrar a import módulo completo en fase futura |
| 10 | `XLSX` referenciado como global (SheetJS CDN) | reports.js | Dependencia implícita | Import map o `npm install xlsx` |
| 11 | `window.location.reload()` en `handleLogout` | L396 | Destruye estado SPA | Transición sin recarga |
| 12 | Filtración de datos entre estudiantes (Rules leen sin scope) | L122-126 rules | Medio (un student ve reservas ajenas) | Ver riesgo #11 — corregido en prerrequisito rules o queda como deuda |
