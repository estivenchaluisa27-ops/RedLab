---
updatedAtCommit: 2f21260f583df871d2beb7e5ae7c5aeb41d428fe
---

# RedLab — Módulos (inventario por capas)

Todo lo afirmado está en el código citado. `docs/` solo se referencia (§docs).

## Calendario

- `src/calendar/calendar.js:30-56` `classifySlot(dateStr, hourStr, reservations, userState)` → `past | blocked | my-approved | my-pending | full | partial | free`; `past` primero (`:31-32`), `blocked` sobre el resto (`:34-35`), tope 4 grupos aprobados (`:51-53`).
- `src/calendar/calendar.js:324-345` `renderStudentCalendar`: tabla 7–19h, celdas `data-action="student-slot-toggle"` (`:339`).
- `src/calendar/calendar.js:352` skeleton inmediato `syncStudentDayView(weekDays, null, classifySlot)`; `:354-362` `mergeAndRender` fusiona `blockedDocs` + `courseDocs` y re-sincroniza sin re-suscribir.
- `src/calendar/calendar.js:364-378` listener `calendar:student-blocked` (filtro `status == blocked` + rango semana); `:380-394` listener `calendar:student-course` (filtro `courseId == state.courseId` + rango).
- `src/calendar/calendar.js:397-455` `renderStudentSlots`: respeta `past`, aplica `classifySlot`, conserva `selectedSlots`.
- `src/calendar/calendar.js:119-186` admin: `registerListener('calendar:reservations', …)` por rango + `listenAdminPending` en `:195-258` (`status == pending`).
- `src/calendar/calendar.js:461-472` `refreshStudentCalendar` = `getWeekDays(weekOffset)` + render; `setupStudentView` limpia, cablea `data-action` en botones de semana (`:468-469`), `initStudentDayView({ onWeekJump: refreshStudentCalendar })` (`:470`).

## Vista-día móvil del estudiante (nueva)

- `src/calendar/student-day-view.js:1-20` contrato: solo móvil (`md:hidden` en `index.html`), tira L–V + carrusel, cambio de día = re-render cliente, semana solo en bordes.
- API: `initStudentDayView` (`:64-75`, idempotente, cablea `scroll`/`scrollend`/`touchstart`/`touchend`); `syncStudentDayView(weekDays, docsArray, classifySlot)` (`:85-95`, pinta tira + 5 páginas, cero suscripción Firestore); `selectStudentDay(index)` (`:103-112`); `currentDayPage` (`:235-239`).
- Constantes: `STRIP_ID`/`CAROUSEL_ID` (`:26-27`), `FIRST_HOUR 7`–`LAST_HOUR 19` (`:28-29`), `EDGE_THRESHOLD_PX 60` (`:30`), `SETTLE_DEBOUNCE_MS 120` (`:31`).
- Render: tira `role=tab` + `data-action="student-day-select"` (`:124`), día activo `.day-active` (`:132-140`); tarjetas 13/hora con `cardFor` (`:155-200`) reutilizando `classifySlot` (`:169`); `renderDayPage` (`:212-227`).
- Sincronía: `scrollToPage` con flag `isProgrammatic` + `safetyTimer` (`:241-259`); `onScroll` debounce (`:261-265`); `onSettled` (`:267-281`); overscroll en bordes `onTouchStart/End` (`:285-306`); `jumpWeek` (`:308-325`): `nextWeekLanding` + `weekOffset±1`, `landingIndex`, `selectedSlots=[]`, `onWeekJump()`, guardia `isSettling`.

## Métricas — reservas por grupo/semana/mes (solo lectura) {#metricas}

- `src/metrics/metrics-queries.js:22-31` `fetchApprovedReservations(db, startStr, endStr)`: rango `date>=,<=` + `status==approved`; filtro por curso en memoria (sin índice nuevo); lectura `approved` permitida a admin y profesor (`firestore.rules:117-124`).
- `src/metrics/metrics-aggregate.js:33-48` `filterByDateRange`/`filterByCourse` (`ALL_COURSES='ALL'` en `:20`); `:55-67` `countByGroup` (1 doc aprobado = 1 hora, no-aprobado se ignora); `:75-79` `toRanking` (horas desc, nombre asc); `:91-103` `aggregateMetrics` → `weeklyByGroup`, `monthlyByGroup`, `ranking`.
- `src/metrics/metrics-charts.js:14` Chart.js `4.4.1` por CDN fijado (sin dep npm); `:26-40` `ensureChartJs` carga perezosa una vez (`null` sin conexión); `:50-81` `renderBarChart` destruye la instancia previa; `:86-91` `destroyMetricsCharts`.
- `src/metrics/metrics-view.js:39` `visibleCourses`: admin todo, profesor solo `professorEmail == user.email`; `:63` `computeRanges` semana (`getWeekDays(0)`) y mes (día 1 → hoy); `:33` `RANKING_LIMIT 10`; `:205-217` reintento único si el caché aún no cargó; sin `data-action`, listeners propios (`:263-270`); setup en `src/main.js:70` con `rerunOnEveryEnter`.

## Cursos — eliminar curso (solo admin) {#cursos-eliminar}

- `src/courses/courses-list.js:140` item `Eliminar curso` (`data-action="delete-course"`) pintado solo si `_state.role === 'admin'` (profesor: solo-lectura).
- `src/courses/courses.js:139-141` `canDeleteCourse(role)` → true solo `'admin'`; `:150-157` `buildCourseDeletionPlan` (puro): subcolección `courses/{id}/groups` → `reservations where courseId==id` → `student_directory where courseId==id` → doc `courses/{id}`; `:169` `chunkArray` (trozos de 400, bajo el límite 500 de Firestore).
- `src/courses/courses.js:185-186` guardia + retorno; `:193` `notifyConfirm` con nombre del curso; `:198-240` borrados por lote troceado (patrón `deleteGroup`); `:243` doc del curso al final; `:245-247` purga `coursesCache`; igualdad simple `courseId==`, sin índice nuevo.
- Reglas: `firestore.rules:82-93` en `courses/{courseId}` — `create/delete` solo admin (`:88,:93`); profesor edita solo su curso.
- Cableado: `src/actions.js:82` `'delete-course': (btn) => deleteCourse(btn.dataset.id)` (import `:25`).

## Router admin {#router-admin}

- `src/router.js:24` `SECTIONS` incluye `metricas`; `#/admin/metricas → { section: 'metricas' }`; sección desconocida cae a `calendario`.
- `src/main.js:70` `registerSectionSetup('metricas', …, { rerunOnEveryEnter: true })` (registro en `src/admin-router-controller.js:41-42`).
- `src/admin-router-controller.js:114` `ADMIN_ONLY_SECTIONS = ['usuarios','ajustes']` → Métricas accesible a admin y profesor; `:116-123` oculta items admin-only, `:134` redirige a no-admin fuera de secciones admin-only.

## Estado

- `src/state.js:24` `weekOffset`, `:25` `activeDayIndex` (default `defaultActiveDayIndex()` en `:12-15`: hoy si L–V, si no lunes).
- `src/state.js:57` `listenerRegistry`; `registerListener` (`:66-77`) invoca el previo antes de reemplazar (anti zombie al cambiar de semana); `unregisterListener` (`:91-97`); `clearAllListeners` (`:102-107`, logout).

## Fechas

- `src/utils/dates.js:10-24` `getWeekDays(offset)` → 5 fechas lun–vie; `:32-36` `clampDayIndex` (rango 0-4, trunca, no-numérico → 0); `:47-52` `nextWeekLanding` (viernes+adelante → +1/lunes; lunes+atrás → −1/viernes; resto 0); `:58-63` `formatDateYYYYMMDD`; `:71-76` `isPastDate` (slot `h+1` < ahora).

## Acciones {#acciones}

- `src/actions.js:38-107` `createClickActions`: `admin-slot-toggle` (`:96`), `open-slot-info` con `stopPropagation` (`:97`), `admin-prev/next-week` (`:98-99`), `student-slot-toggle` (`:102`), `student-day-select` → `selectStudentDay` (`:103`), `student-prev/next-week` (`:104-105`, `weekOffset±1` + `selectedSlots=[]` + `refreshStudentCalendar`), `delete-course` → `deleteCourse(btn.dataset.id)` (`:82`).
- `src/actions.js:113-121` `createSubmitActions` (cursos, bloqueo recurrente, reportes, alta de cuenta).
- Dispatcher en `src/main.js:68-80`: `click` → `closest('[data-action]')` → `clickActions[action](btn, e)`; `submit` vía `createSubmitDispatcher`.

## Shell HTML {#shell-html}

- `index.html:130` bloque admin (`admin-prev/next-week`, `admin-calendar-head/body`, `admin-action-box`).
- `index.html:109` item Métricas (`href="#/admin/metricas"`, icono `fa-chart-bar`); `index.html:342` `section#section-metricas[data-section=metricas]` (solo lectura: filtro curso, toggle semana/mes, tabla + 3 canvas con fallback).
- `index.html:349` bloque estudiante (`student-prev/next-week`, `#student-day-strip[role=tablist].md:hidden`, `#student-day-carousel.md:hidden` con 5 `section[data-day-index]`, tabla `hidden md:table` con `student-calendar-head/body`).

## Estilos {#estilos}

- Fuente: `src/styles/tailwind-input.css` (directivas Tailwind `:1-3`); vista-día `:894-990` (tira `:897-928`, carrusel `:931-948`, tarjetas `:958-976`, `prefers-reduced-motion` `:979-982`, oculto en desktop `:987-990`); calendario `:91-120`; mobile `:399-428`.
- Compilado: `styles.css:1` minificado; se genera con `npm run build:css` (`package.json:12`: `tailwindcss -i src/styles/tailwind-input.css -o styles.css --minify`).

## Build + móvil {#build-movil}

- `scripts/build-app.js:21-27` `ASSETS = index.html, 404.html, styles.css, assets, src`; `:29-47` limpia y copia a `www/`.
- `www/` generado e ignorado (`.gitignore:37-38`); `capacitor.config.json:2` `appId "edu.uce.redlab"`, `:4` `webDir "www"`.

## Push {#push}

- `push-worker/src/index.js:1-15` worker Cloudflare cada minuto (motivo: cron Actions sin SLA), `PROJECT_ID "lab-redes-turnos"` (`:17`), `PUSHABLE_TYPES ["aprobada","rechazada"]` (`:22`), purga tokens muertos (`:32`).
- `redlab-push-server/index.js:37-40` init `firebase-admin`, `:49` `statusCache` anti-duplicados.

## Tests {#tests}

- `tests/calendar/day-view.test.js:3-9` imports (`dates`, `state`, `student-day-view`); `:84-145` suite tira+carrusel (5 tabs, 5×13 tarjetas, `selectStudentDay`, sync por scroll).
- `tests/calendar/slots.test.js:30-113` suite `classifySlot` (past, blocked, my-approved/pending, full ≥4, partial, free, prioridades).
- `tests/metrics/metrics-aggregate.test.js` 9 tests (rangos semanal/mensual, filtro curso, 1doc=1h, ranking con desempate).
- `tests/courses/course-delete.test.js` 9 tests (`canDeleteCourse` + `buildCourseDeletionPlan` + `chunkArray` con lotes `[400,400,1]`).

## Docs existentes (referencia, no duplicar) {#docs}

- `docs/INDICE.md` índice y resumen; `docs/ARQUITECTURA.md` stack y despliegue (`:76-77` comandos `build:app`/`cap:sync`); `docs/FIRESTORE.md` colecciones y ciclo `pending → approved|rejected|blocked`; `docs/FLUJOS.md` reserva/notificaciones. No se modificaron.
