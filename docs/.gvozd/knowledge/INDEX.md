---
updatedAtCommit: 2f21260f583df871d2beb7e5ae7c5aeb41d428fe
---

# RedLab — Índice de conocimiento

Mapa de capas del código real. Detalle en `MODULES.md`, flujos en `FLOWS.md`.
Documentos de diseño existentes (`docs/`): solo se referencian, no se duplican.

## Capas

| Capa | Código real | Ver en |
|---|---|---|
| Shell HTML (admin + estudiante) | `index.html:130` bloque admin, `index.html:109` item Métricas, `index.html:342` sección Métricas, `index.html:349` bloque estudiante (tira + carrusel + tabla) | `MODULES.md#shell-html` |
| Calendario + vista-día móvil | `src/calendar/calendar.js`, `src/calendar/student-day-view.js` (API `initStudentDayView` / `syncStudentDayView` / `selectStudentDay`) | `MODULES.md#calendario`, `FLOWS.md#1-flujo-estudiante` |
| Métricas (solo lectura) | `src/metrics/metrics-queries.js:22` aprobadas en rango, `src/metrics/metrics-aggregate.js:75` horas por grupo + ranking, `src/metrics/metrics-charts.js:26` Chart.js lazy (CDN fijado, sin dep npm), `src/metrics/metrics-view.js:39` filtro profesor por `professorEmail` | `MODULES.md#metricas` |
| Cursos: eliminar (admin) | `src/courses/courses-list.js:140` item solo con `role==='admin'`, `src/courses/courses.js:185` cascada grupos → reservas → directorio → curso, `firestore.rules:93` `allow delete iff isAdmin` | `MODULES.md#cursos-eliminar`, `FLOWS.md#7-eliminar-curso` |
| Router admin | `src/router.js:24` `SECTIONS` incluye `metricas`, `src/main.js:70` setup con `rerunOnEveryEnter`, solo `usuarios,ajustes` son admin-only (Métricas visible a profesor) | `MODULES.md#router-admin` |
| Estado + fechas | `src/state.js` (`activeDayIndex`, `weekOffset`, `listenerRegistry`), `src/utils/dates.js` (`getWeekDays`, `clampDayIndex`, `nextWeekLanding`, `isPastDate`) | `MODULES.md#estado` |
| Delegación `data-action` | `src/actions.js` (`createClickActions`, `createSubmitActions`), dispatcher en `src/main.js:68-80` | `MODULES.md#acciones`, `FLOWS.md#4-data-action` |
| Estilos | Fuente `src/styles/tailwind-input.css`, compilado `styles.css` (vía `build:css`) | `MODULES.md#estilos` |
| Build + móvil | `scripts/build-app.js`, `www/` generado e ignorado, `capacitor.config.json:2` (`appId edu.uce.redlab`) | `MODULES.md#build-movil`, `FLOWS.md#5-build` |
| Push | `push-worker/src/index.js`, `redlab-push-server/index.js` | `MODULES.md#push` |
| Tests | `tests/calendar/day-view.test.js`, `tests/calendar/slots.test.js`, `tests/metrics/metrics-aggregate.test.js` (9 tests: rangos, conteo 1doc=1h, ranking), `tests/courses/course-delete.test.js` (9 tests: guard, plan, chunks) | `MODULES.md#tests` |
| Diseño (referencia) | `docs/ARQUITECTURA.md`, `docs/FIRESTORE.md`, `docs/FLUJOS.md`, `docs/INDICE.md` | `MODULES.md#docs` |

## Nota de frescura

- `updatedAtCommit` de estas 3 páginas: `2f21260f583df871d2beb7e5ae7c5aeb41d428fe`.
- Verificado con `git rev-parse HEAD` + `git show --stat --oneline HEAD` (mismo hash) y `git status --short` limpio.
- Cubre dos commits: `fd63b4d feat(admin): dashboard metricas de reservas por grupo semana mes` (8 archivos) y `2f21260 feat(admin): eliminar curso solo-admin con borrado en cascada` (4 archivos). El push a `master` dispara el deploy (workflow `deploy.yml`: CI + hosting).
