---
updatedAtCommit: e4e32fff6bef7a46b06b050241ad3d64ca0bb0c6
---

# RedLab — Índice de conocimiento

Mapa de capas del código real. Detalle en `MODULES.md`, flujos en `FLOWS.md`.
Documentos de diseño existentes (`docs/`): solo se referencian, no se duplican.

## Capas

| Capa | Código real | Ver en |
|---|---|---|
| Shell HTML (admin + estudiante) | `index.html:130` bloque admin, `index.html:349` bloque estudiante (tira + carrusel + tabla) | `MODULES.md#shell-html` |
| Calendario + vista-día móvil | `src/calendar/calendar.js`, `src/calendar/student-day-view.js` (API `initStudentDayView` / `syncStudentDayView` / `selectStudentDay`) | `MODULES.md#calendario`, `FLOWS.md#1-flujo-estudiante` |
| Estado + fechas | `src/state.js` (`activeDayIndex`, `weekOffset`, `listenerRegistry`), `src/utils/dates.js` (`getWeekDays`, `clampDayIndex`, `nextWeekLanding`, `isPastDate`) | `MODULES.md#estado` |
| Delegación `data-action` | `src/actions.js` (`createClickActions`, `createSubmitActions`), dispatcher en `src/main.js:68-80` | `MODULES.md#acciones`, `FLOWS.md#4-data-action` |
| Estilos | Fuente `src/styles/tailwind-input.css`, compilado `styles.css` (vía `build:css`) | `MODULES.md#estilos` |
| Build + móvil | `scripts/build-app.js`, `www/` generado e ignorado, `capacitor.config.json:2` (`appId edu.uce.redlab`) | `MODULES.md#build-movil`, `FLOWS.md#5-build` |
| Push | `push-worker/src/index.js`, `redlab-push-server/index.js` | `MODULES.md#push` |
| Tests | `tests/calendar/day-view.test.js`, `tests/calendar/slots.test.js` | `MODULES.md#tests` |
| Diseño (referencia) | `docs/ARQUITECTURA.md`, `docs/FIRESTORE.md`, `docs/FLUJOS.md`, `docs/INDICE.md` | `MODULES.md#docs` |

## Nota de frescura

- `updatedAtCommit` de estas 3 páginas: `e4e32fff6bef7a46b06b050241ad3d64ca0bb0c6`.
- Verificado con `git rev-parse HEAD` + `git show --stat --oneline HEAD` (mismo hash).
- Aviso honesto: el árbol de trabajo estaba **sucio** al verificar
  (`git status --short`: `M index.html, package.json, src/actions.js, src/calendar/calendar.js, src/state.js, src/styles/tailwind-input.css, src/utils/dates.js, styles.css`;
  `?? src/calendar/student-day-view.js, tests/calendar/day-view.test.js`).
  La vista-día móvil descrita vive en esos cambios sin commitear, no en el HEAD.
  Si `git rev-parse HEAD` deja de devolver el hash de arriba, o `git status --short`
  cambia, estas páginas están desactualizadas.
