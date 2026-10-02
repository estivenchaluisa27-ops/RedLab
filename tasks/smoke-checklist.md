# Smoke checklist (F0B) — correr en local antes de cada merge a `master`

Servir con emuladores o hosting local; verificar con dos usuarios (admin + estudiante).

## Admin
- [ ] Login admin entra al panel sin errores de consola
- [ ] Calendario admin renderiza semana + solicitudes pendientes
- [ ] Cursos: crear, editar, ver grid; grupos: crear, editar miembros, borrar
- [ ] Aprobar y rechazar una reserva pendiente
- [ ] Marcar asistencia (presente/ausente)
- [ ] Bloqueo manual y bloqueo recurrente de horarios
- [ ] Reportes: generar y exportar Excel
- [ ] Todos los modales abren/cierran (botones ×, Cancelar, Escape)

## Estudiante
- [ ] Login student muestra calendario y sus reservas
- [ ] Crear solicitud → aparece `pending`
- [ ] Cancelar reserva propia `pending`/`approved`
- [ ] Notificaciones: historial y contador de no leídas

## Global
- [ ] Consola del navegador sin errores ni warnings nuevos
- [ ] Logout/login cambia de rol sin datos del usuario anterior
- [ ] `npm test` exit 0 (96 passed; reglas solo contra emulador)
