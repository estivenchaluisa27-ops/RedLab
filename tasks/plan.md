# Plan de refactor — `refactor/arch-harden`

Base: rama desde `master` limpio · `npm test` exit 0 (96 passed, 4 skipped sin emulador) · sin CI · reglas sin cobertura.
Rama de trabajo: `refactor/arch-harden`. `master` solo recibe merge con orden explícita del usuario.

## Decisiones
- Dirección de dependencias: `calendar → reservations`, nunca al revés (F1 inyecta callbacks desde `main.js`).
- Un slice = un commit atómico; suite verde (`npm test` exit 0) antes de cada commit.
- Orden secuencial F1→F5 (comparten `calendar.js`/`main.js`); docs paralelizable siempre.

## Fases
- **F0**: blindaje (rama + baseline ✓) + checklist de smoke (`tasks/smoke-checklist.md`).
- **F1**: romper ciclo `calendar ⇄ reservations`; aceptación: grep una sola dirección + suite verde.
- **F2**: 9× `btn.onclick` (`calendar.js`) → dispatcher `data-action`; aceptación: `grep \.onclick src/` = 0 + smoke (Vitest no importa URLs https).
- **F3**: registro único de listeners en `state.js`; aceptación: `grep setUnsubscribers` = 0 + smoke logout/login.
- **F4A**: versión Firebase `11.6.1` a un solo fichero; aceptación: `grep gstatic src/` = 1 fichero.
- **F4B**: `escapeAttr` en 4 `value=` + lint warning anti-`innerHTML` sin escape.
- **F5**: extraer mapa de acciones de `main.js` (198 líneas) a `actions.js`; criterio `<50` declarado muerto, sustituido por `<120` con justificación.
- **F6**: emulador Firestore (4 tests de reglas saltados deben pasar) + CI `.github/workflows/ci.yml` + smoke + merge solo con orden del usuario.

## Riesgos
| Riesgo | Mitigación |
|---|---|
| Ciclo ESM enmascarado por hoisting (F1) | commit atómico, revert de 1 commit |
| Reglas sin cobertura tocan prod | emulador local antes de cualquier cambio en `firestore.rules` |
| Sin CI | crear workflow en F6; mientras tanto, suite manual por slice |
