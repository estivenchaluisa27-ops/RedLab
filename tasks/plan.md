# Plan de refactor — `refactor/arch-harden`

Base: rama desde `master` limpio · `npm test` exit 0 (96 passed, 4 skipped sin emulador) · sin CI · reglas sin cobertura.
Rama de trabajo: `refactor/arch-harden`. `master` solo recibe merge con orden explícita del usuario.

## Estado (actualizado en F6)
Suite: **145 passed, 0 skipped** con emulador Firestore. Sin emulador: 105 passed / 4 skipped (los 4 son *archivos*; el fichero de reglas contiene 40 tests que se saltan).
Commits: F1 `1b15505` · F2 `a544aa3` · F3 `5fa9e49` + follow-up `ced8bf9` · F4A `3f9f3a3` · F4B `394c4e0` · F5 `809be5b`.

### Criterios: real vs. planificado
| Criterio | Planificado | Real | Estado |
|---|---|---|---|
| `grep setUnsubscribers src/` | 0 | 0 | OK |
| `grep "\.onclick" src/` | 0 | 0 | OK |
| Ficheros con `gstatic` en `src/` | 1 | 1 (`firebase-config.js`) | OK |
| `main.js` lineas | `<120` | **135** | **no cumplido** |
| tests de reglas | pasan | **40 pasan** (no 4) | OK |

**Por que `main.js` no llego a `<120`.** F5 extrajo los dos mapas de `data-action`
(`clickActions` 67 lineas + `submitActions` 7) a `src/actions.js`: 225 -> 135.
Lo que queda son 135 lineas de bootstrap real (init de 7 modulos, registro del
router, binds de 4 formularios, wiring del burger, footer del sidebar). Bajar a
`<120` exigiria extraer el burger y el bloque del footer, que es reorganizacion
cosmetica con riesgo de regresion en el sidebar y **sin beneficio arquitectonico**.
Se registra el incumplimiento en lugar de perseguir el numero; el objetivo real de
F5 — que el punto de entrada no contenga logica de negocio — esta cumplido:
`main.js` ya no importa ni un solo handler de dominio.

## Decisiones
- Dirección de dependencias: `calendar → reservations`, nunca al revés (F1 inyecta callbacks desde `main.js`).
- Un slice = un commit atómico; suite verde (`npm test` exit 0) antes de cada commit.
- Orden secuencial F1→F5 (comparten `calendar.js`/`main.js`); docs paralelizable siempre.

## Fases
- **F0**: blindaje (rama + baseline ✓) + checklist de smoke (`tasks/smoke-checklist.md`).
- **F1**: romper ciclo `calendar ⇄ reservations`; aceptación: grep una sola dirección + suite verde. **OK `1b15505`**
- **F2**: 9× `btn.onclick` (`calendar.js`) → dispatcher `data-action`; aceptación: `grep \.onclick src/` = 0 + smoke (Vitest no importa URLs https). **OK `a544aa3`**
- **F3**: registro único de listeners en `state.js`; aceptación: `grep setUnsubscribers` = 0 + smoke logout/login. **OK `5fa9e49`** + follow-up `ced8bf9` (2 advisories de revisión + `tests/state.test.js`, 9 casos).
- **F4A**: versión Firebase `11.6.1` a un solo fichero; aceptación: `grep gstatic src/` = 1 fichero. **OK `3f9f3a3`**
- **F4B**: `escapeAttr` en 4 `value=` + lint warning anti-`innerHTML` sin escape. **OK `394c4e0`**
- **F5**: extraer mapa de acciones de `main.js` (198 líneas) a `actions.js`; criterio `<50` declarado muerto, sustituido por `<120`. **OK `809be5b`** — ver tabla: quedó en **135**, criterio no cumplido y registrado.
- **F6**: emulador Firestore + CI `.github/workflows/ci.yml` + smoke + merge solo con orden del usuario. **PARCIAL**: emulador y CI listos, 40/40 tests de reglas verdes, falta smoke manual y merge.

## Riesgos
| Riesgo | Mitigación |
|---|---|
| Ciclo ESM enmascarado por hoisting (F1) | commit atómico, revert de 1 commit |
| Reglas sin cobertura tocan prod | emulador local antes de cualquier cambio en `firestore.rules` |
| Sin CI | crear workflow en F6; mientras tanto, suite manual por slice |
| Regla eslint `innerHTML`: 58 warnings idénticos | es bitácora, no puerta (`warn`, `lint` sale 0). 42/58 caen sobre markup estático, o sea ruido real: se acepta como deuda registrada |
| `registerListener(name, onSnapshot(...))` suscribe antes de anular el viejo | correcto hoy por el tick síncrono de Firestore, pero la invariante "≤1 vivo por clave" depende del SDK, no del código. Un `replaceListener(name, thunk)` lo haría explícito |
