# RedLab — Índice de documentación

## ¿Qué es RedLab?

Sistema de gestión para laboratorio de idiomas: cursos, grupos, reservas de salas con calendario, notificaciones push en Android y panel de administración. Backend serverless (Firebase) + push server propio en Fly.io.

## Documentación

| Documento | Contenido |
|---|---|
| [README](../README.md) | Portada y guía rápida |
| [Arquitectura](ARQUITECTURA.md) | Stack, componentes, módulos, seguridad, despliegue |
| [Firestore](FIRESTORE.md) | Colecciones, roles y matriz de reglas |
| [Flujos](FLUJOS.md) | Reservas, cursos, notificaciones push, build Android |

## Resumen rápido

- **Stack:** SPA vanilla JS + Tailwind · Capacitor 8 (Android) · Firebase Hosting/Firestore/Auth · Node + FCM (Fly.io) · Vitest
- **Rol por email:** `admins/`, `professors/`, `student_directory/`
- **Reservas:** `pending → approved | rejected | blocked` (bloqueo = horario inutilizable)
- **Push:** token FCM en `device_tokens/{uid}` → push server Fly.io → Android + historial en Firestore