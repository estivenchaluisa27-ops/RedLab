# TODO — refactor `refactor/arch-harden`

## F0 — Blindaje
- [x] Rama `refactor/arch-harden` desde `master` limpio
- [x] Baseline `npm test`: 96 passed, 4 skipped, exit 0
- [x] Checklist de smoke (`tasks/smoke-checklist.md`)

## Checkpoint F0
- [x] Suite verde, árbol limpio, plan aprobado por el usuario

## F1 — Ciclo calendar ⇄ reservations
- [ ] Callbacks inyectadas desde `main.js`, firmas intactas
- [ ] `grep` una sola dirección + suite verde
## Checkpoint F1+F2
- [ ] Suite verde + smoke calendario + revisión con el usuario

## F2 — onclick → dispatcher
- [ ] 9× `btn.onclick` → `data-action`; `grep \.onclick src/` = 0
- [ ] Smoke calendario (Vitest no cubre render con CDN-https)

## F3 — Registro único de listeners
- [ ] `grep setUnsubscribers src/` = 0; cada `init*` registra el suyo
- [ ] Smoke logout/login sin huérfanos
## Checkpoint F3+F4
- [ ] Suite verde + smoke + revisión con el usuario

## F4A — Vendor Firebase centralizado
- [ ] `grep gstatic src/` = 1 fichero; suite verde

## F4B — escapeAttr + lint
- [ ] 4 `value=` con escape; lint sin errores nuevos

## F5 — Slim main.js
- [ ] `actions.js` extraído; `main.js` < 120 líneas

## F6 — Hardening + merge
- [ ] 4 tests de reglas pasan contra emulador local
- [ ] CI creada y verde; smoke completo
- [ ] Merge a `master` solo con orden explícita
