# RedLab — Firestore: colecciones y reglas

Modelo de datos y matriz de acceso de `firestore.rules`. Rol derivado por existencia del email autenticado en cada colección (`admins/`, `professors/`, `student_directory/`).

## Roles

| Rol | Determinación |
|---|---|
| Admin | `admins/{email}` existe |
| Profesor | `professors/{email}` existe |
| Estudiante | `student_directory/{email}` existe (con `courseId` y `groupId`) |

## Colecciones

| Colección | Documento | Contenido | Quién escribe |
|---|---|---|---|
| `admins/{email}` | — | Administradores del sistema | solo admin |
| `professors/{email}` | — | Profesores registrados | solo admin |
| `student_directory/{email}` | `courseId`, `groupId` | Directorio estudiantil (matrícula por curso/grupo) | solo admin |
| `courses/{courseId}` | `professorEmail`, datos del curso | Catálogo de cursos | admin (create/delete); profesor del curso puede editar su curso |
| `courses/{courseId}/groups/{groupId}` | `name`, ... | Grupos dentro del curso | admin; profesor del curso |
| `reservations/{reservationId}` | `userId`, `date`, `hour`, `status`, `courseId`, `groupName`, `attendanceDetail` | Reservas de sala | estudiantes (crear `pending`); admin/profesor (cambiar status) |
| `notifications/{notificationId}` | `userId`, `type`, `date`, `hour`, `read`, `createdAt` | Historial de notificaciones | flujo del sistema; estudiante solo `solicitada`/`cancelada` propias |
| `device_tokens/{uid}` | `tokens` (array FCM), `email`, `platform` | Tokens de dispositivos | solo el dueño del `uid` |

## Ciclo de vida de una reserva (`status`)

```
pending ──(profesor/aprueba)──> approved
   │
   ├──(profesor/rechaza)──> rejected
   └──(admin bloquea horario)──> blocked   (userId = "ADMIN", horario inutilizable)
```

- El estudiante **crea** reservas únicamente en `pending`, con validación estricta (`isValidReservationCreate`): fecha/hora presentes, `userId` = propio UID, curso y grupo **coinciden con su directorio** (`courseId` y `groupName` derivados), `attendanceDetail` nulo.
- El **estudiante elimina** solo reservas propias en `pending`/`approved`.
- **Admin** crea `blocked` (bloqueos manuales/recurrentes) y elimina cualquier reserva.
- **Profesor** actualiza status solo de reservas de sus cursos.

## Reglas destacadas

- **Lectura de reservas**: admin todo; profesor ve `approved`/`blocked` globales + `pending` de sus cursos; estudiante ve `blocked` (todos) + reservas de su curso.
- **Notificaciones**: el estudiante solo lee las suyas (`userId == auth.uid`); al marcar como leída, `diff().affectedKeys().hasOnly(['read'])` garantiza que nada más cambie; tipos válidos: `solicitada, aprobada, rechazada, cancelada, bloqueada`.
- **Tokens FCM**: `device_tokens/{uid}` solo lo toca el dueño del UID.
- **Denegación por defecto**: `match /{document=**}` → `false`.

## Índices compuestos

Definidos en `firestore.indexes.json` (consultas por combinaciones de campos, p. ej. reservas por fecha/hora/curso).

## Docs relacionados

- [Arquitectura](ARQUITECTURA.md)
- [Flujos principales](FLUJOS.md)
- [Índice](INDICE.md)