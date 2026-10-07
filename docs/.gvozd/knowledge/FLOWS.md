---
updatedAtCommit: e4e32fff6bef7a46b06b050241ad3d64ca0bb0c6
---

# RedLab — Flujos clave (verificados en código)

## 1. Render calendario estudiante {#1-flujo-estudiante}

1. `setupStudentView` (`src/calendar/calendar.js:466-472`) limpia listeners, cablea semana, `initStudentDayView({ onWeekJump: refreshStudentCalendar })`, `refreshStudentCalendar()`.
2. `renderStudentCalendar` (`:324-345`) pinta tabla 7–19h y llama `syncStudentDayView(weekDays, null, classifySlot)` (`:352`) → skeleton móvil inmediato.
3. Dos `onSnapshot` en rango lun–vie: `calendar:student-blocked` (`:364-378`) y `calendar:student-course` (`:380-394`); cada uno actualiza su `Map` y llama `mergeAndRender` (`:354-362`), que une ambos, invoca `renderStudentSlots` (`:397-455`) y `syncStudentDayView(weekDays, docsArray, classifySlot)` (`:361`) sin re-suscribir.
4. Clasificación por slot vía `classifySlot` (`:30-56`; detalle y prioridades en `MODULES.md#calendario`); verificado por `tests/calendar/slots.test.js:30-113`.

## 2. Vista-día móvil sin re-suscripción

1. `syncStudentDayView` (`src/calendar/student-day-view.js:85-95`) guarda `lastWeekDays/lastDocs/lastClassify`, `clampDayIndex` (`src/utils/dates.js:32-36`), pinta tira (`:120-130`) y las 5 páginas (`:212-227`).
2. Tira → carrusel: `selectStudentDay` (`:103-112`) actualiza `state.activeDayIndex`, `paintStripActive` (`:132-140`), `scrollToPage` (`:241-259`).
3. Carrusel → tira al asentar: `onScroll` debounce 120ms (`:261-265`), `scrollend` (`:71`) u `onSettled` (`:267-281`); flag `isProgrammatic` + `safetyTimer` evitan loops (`:253-258`, `:270-273`).
4. Cambio de día = re-render cliente desde `lastDocs` (`:212-227` + `groupDocs` `:144-153`), cero Firestore. Cubierto en `tests/calendar/day-view.test.js:84-145`.

## 3. Salto de semana con re-suscripción

1. Desktop/tabla: `student-prev/next-week` en `src/actions.js:104-105` → `state.weekOffset±1`, `selectedSlots=[]`, `refreshStudentCalendar()` (`src/calendar/calendar.js:461-464`) → `getWeekDays(weekOffset)` (`src/utils/dates.js:10-24`) + `renderStudentCalendar` que re-registra los dos listeners (el `registerListener` de `src/state.js:66-77` cierra el previo: sin zombies).
2. Móvil/carrusel: solo en bordes con overscroll ≥60px (`:290-306`); `jumpWeek` (`:308-325`) calcula `nextWeekLanding` (`src/utils/dates.js:47-52`: viernes+adelante → semana+1/lunes; lunes+atrás → semana−1/viernes), aplica `weekOffset`/`landingIndex`, vacía `selectedSlots`, llama `onWeekJump` (= `refreshStudentCalendar`), guardia `isSettling` 350ms anti doble salto.
3. Admin análogo en `src/actions.js:98-99` + `refreshAdminCalendar` (`src/calendar/calendar.js:260-263`).

## 4. Delegación `data-action` {#4-data-action}

1. `src/main.js:68-80`: un solo listener `click` en `document` resuelve `closest('[data-action]')` y despacha a `createClickActions({auth})` (`src/actions.js:38-107`); `submit` va por `createSubmitDispatcher`.
2. Los renders asignan las acciones: `admin-slot-toggle` (`src/calendar/calendar.js:111`), `student-slot-toggle` (`:339`), `student-day-select` (`src/calendar/student-day-view.js:124`), `toggle-matrix-cell` (`src/calendar/calendar.js:192`), `adm-act`/`reject-req` (`:251-252`).

## 5. Cadena de build {#5-build}

1. `npm run build:css` (`package.json:12`) compila `src/styles/tailwind-input.css` → `styles.css`.
2. `npm run build:app` (`package.json:13` → `scripts/build-app.js:21-47`) copia `index.html, 404.html, styles.css, assets, src` a `www/`.
3. `npm run cap:sync` (`package.json:14`) = `build:app` + `npx cap sync android`; `www/` está ignorado (`.gitignore:37-38`) y es `webDir` (`capacitor.config.json:4`). El APK debug se ensambla después con el proyecto Android generado (fuera del repo).
