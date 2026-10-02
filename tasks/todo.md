# TODO — refactor `refactor/arch-harden`

## F0 — Blindaje
- [x] Rama `refactor/arch-harden` desde `master` limpio
- [x] Baseline `npm test`: 96 passed, 4 skipped, exit 0
- [x] Checklist de smoke (`tasks/smoke-checklist.md`)

## Checkpoint F0
- [x] Suite verde, árbol limpio, plan aprobado por el usuario

## F1 — Ciclo calendar ⇄ reservations ✅ (a544aa3 precede: 1b15505)
- [x] Callbacks inyectadas desde `main.js`, firmas intactas
- [x] `grep` una sola dirección + suite verde (96/4)
- [x] Review-deep ADVISORY, sin blockers
## Checkpoint F1+F2
- [x] Suite verde + revisión (falta smoke calendario manual)

## F2 — onclick → dispatcher ✅ (a544aa3)
- [x] 9× `btn.onclick` → `data-action`; `grep \.onclick src/` = 0
- [x] Smoke calendario pendiente (Vitest no cubre render con CDN-https)
- [x] Review-fast APPROVE (3 nits no bloqueantes)

## F3 — Registro único de listeners ✅ (5fa9e49 + follow-up ced8bf9)
- [x] `grep setUnsubscribers src/` = 0; cada `init*` registra el suyo (8 claves, 8 registros)
- [x] Review-deep APPROVE en los tres commits: 0 blocking, 9 advisories
- [x] Follow-up `ced8bf9`: 2 advisories cerrados (guarda de notificaciones consulta el registro; logout limpia `clearCalendarListeners` + `clearGroupUtilsCache`)
- [x] `tests/state.test.js`: 9 casos del listener registry (antes 0 cobertura)
- [ ] Smoke logout/login sin huérfanos — **pendiente, requiere navegador**

## F4A — Vendor Firebase centralizado ✅ (3f9f3a3)
- [x] `grep gstatic src/` = 1 fichero (`firebase-config.js`); suite verde

## F4B — escapeAttr + lint ✅ (394c4e0)
- [x] 4 `value=` con escape (+2 `id=`); lint 0 errores, 58 warnings preexistentes de la regla `innerHTML`

## F5 — Slim main.js ✅ (809be5b) — criterio NO cumplido
- [x] `actions.js` extraído (2 mapas, 74 líneas)
- [x] 19/19 `data-action` del HTML estático con handler; 0 emisiones desde `src/` sin handler; 5/5 formularios de submit
- [x] `main.js` 225 → **135 líneas** (`<120` NO cumplido, registrado en `plan.md`)
- [x] `main.js` ya no importa ningún handler de dominio

## F6 — Hardening + merge
- [x] **Corrección de conteo**: los tests de reglas son **40**, no 4. El "4 skipped" que figuraba desde el baseline era el número de *archivos* de test, no de tests. Suite real sin emulador: 105 passed / 4 skipped (archivos). Con emulador: **145 passed / 0 skipped**.
- [x] 40 tests de reglas pasan contra emulador local (Java 21 + firebase-tools 15.30.1 ya instalados)
- [x] `npm run emulators` y `npm run test:rules` cableados en `package.json`
- [x] `.github/workflows/ci.yml`: lint → build:css → emulador → reglas → suite. `rules` va explícito porque sin emulador los 40 tests se saltan en silencio y un run verde no probaría `firestore.rules`
- [ ] Smoke completo (`tasks/smoke-checklist.md`) — requiere navegador
- [ ] Merge a `master` solo con orden explícita
