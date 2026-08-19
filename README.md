# RedLab

Sistema de gestión para laboratorio de idiomas: cursos, grupos, reservas de salas con calendario, notificaciones push en Android y panel de administración. Frontend web (SPA) + app Android (Capacitor) + push server propio en Fly.io.

## Stack

SPA vanilla JS + Tailwind · Capacitor 8 · Firebase (Hosting, Firestore, Auth) · Node + FCM (Fly.io) · Vitest

## Inicio rápido

```bash
npm install

# Desarrollo web
firebase emulators:start   # o sirve la SPA con tu servidor estático preferido

# Build
npm run build:css          # Tailwind → styles.css
npm run build:app          # construye la app (www/ para Capacitor)
npm run cap:sync           # build + sync Android
npm run test               # Vitest
npm run lint               # ESLint

# Producción
firebase deploy            # Hosting + Firestore rules
```

Requiere un proyecto Firebase configurado (`src/firebase-config.js`, `.firebaserc`) y, para push, el servidor `redlab-push-server/` desplegado en Fly.io.

## Funcionalidades

- Roles por email: admin, profesor, estudiante (directorio estudiantil)
- Cursos con grupos y grid de miembros
- Reservas de salas con calendario: `pending → approved | rejected | blocked`
- Notificaciones in-app con historial y contador de no leídas
- Notificaciones push en Android (FCM) vía push server en Fly.io

## Documentación

- [Índice de documentación](docs/INDICE.md)
- [Arquitectura](docs/ARQUITECTURA.md)
- [Firestore (colecciones y reglas)](docs/FIRESTORE.md)
- [Flujos principales](docs/FLUJOS.md)