# RedLab — Reporte de Análisis y Mejoras

## Resumen Ejecutivo

Se analizó el proyecto **RedLab** (Sistema de Turnos del Laboratorio de Redes UCE), un monolito HTML de ~1700 líneas con Firebase Auth + Firestore + Tailwind CDN. Se ejecutaron auditorías usando las skills del proyecto y herramientas MCP, y se aplicaron correcciones de seguridad y calidad.

---

## Hallazgos y Acciones Tomadas

### 1. Indexación del Código (codebase-memory-mcp)
- **Estado:** ✅ Completado (313 nodos, 310 edges)
- El grafo reveló que el proyecto es 100% HTML (sin JS separado, sin tests, sin build)
- Archivo persistente en `.codebase-memory/graph.db.zst`

### 2. Vulnerabilidad XSS (Corregida)
- **Severidad:** CRITICAL
- **Hallazgo:** 27 puntos donde datos de Firestore se insertaban en `innerHTML` sin sanitizar (nombres de grupos, estudiantes, profesores, emails)
- **Corrección:** Se añadió función `escapeHtml()` y se envolvieron todas las interpolaciones dinámicas
- **Pendiente:** Valores en `onclick="..."` de botones generados dinámicamente (`groupName`, `cedula`) — requerirían refactor a event delegation

### 3. Reglas de Seguridad Firestore (Creadas)
- **Severidad:** CRITICAL
- **Hallazgo:** No existía `firestore.rules` en el repositorio
- **Corrección:** Se creó `firestore.rules` con:
  - Funciones auxiliares: `isAdmin()`, `isProfessor()`, `isStudent()`
  - Validación de campos obligatorios en creación de reservas
  - Restricción: estudiantes solo crean reservas con `status='pending'`
  - Restricción: estudiantes no pueden escribir `attendanceDetail`
  - Acceso granular por colección y rol
  - Profesores solo ven sus propios cursos

### 4. Workflow de CI (Corregido)
- **Severidad:** MEDIUM
- **Hallazgo:** `firebase-hosting-github.yml.txt` — extensión `.txt` impedía ejecución en GitHub Actions
- **Corrección:** Archivo renombrado a `.github/workflows/firebase-hosting-github.yml`

### 5. Accesibilidad WCAG 2.2 (Auditoría)
- **Severidad:** Alta (14 hallazgos, 4 Critical)
- **No corregido** (requiere cambios extensos en HTML/JS):
  - Inputs sin `<label for="">` (3.3.2)
  - Imágenes sin `alt` (1.1.1)
  - Botones icono sin `aria-label` (4.1.2)
  - 10+ modales sin `role="dialog"` ni focus trap (2.1.2)
  - Sin `prefers-reduced-motion` (2.3.3)
  - Sin skip link (2.4.1)
  - Contraste insuficiente `#64748b` sobre blanco (1.4.3)
  - Sin `aria-live` en zonas dinámicas (4.1.3)
  - Toggle password no keyboard-accessible (2.1.1)
  - Tablas sin `<caption>` ni `scope` (1.3.1)

### 6. SEO (Auditoría + Correcciones)
- **Severidad:** Baja-Media (app interna, login pública)
- **Hallazgos principales:** Sin `robots.txt`, sin `sitemap.xml`, sin `canonical`, sin meta description, sin JSON-LD, múltiples `<h1>`, imágenes sin alt, scripts bloqueantes
- **Correcciones pendientes** (baja prioridad para app interna)

---

## Archivos Creados/Modificados

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `index.html` | Modificado | +34/-24 líneas: escapeHtml() + 27 sustituciones XSS |
| `firestore.rules` | Creado | Reglas de seguridad Firestore por rol |
| `.github/workflows/firebase-hosting-github.yml` | Creado | Workflow CI renombrado de .txt a .yml |
| `.github/workflows/firebase-hosting-github.yml.txt` | Eliminado | Archivo con extensión incorrecta |
| `.codebase-memory/graph.db.zst` | Creado | Grafo de código indexado (compartible) |

---

## Oportunidades de Mejora Priorizadas

### Fase 1 — Críticas (seguridad, hacer ahora)
1. ✅ ~~XSS en innerHTML~~ — **CORREGIDO**
2. ✅ ~~Reglas de seguridad Firestore~~ — **CORREGIDO** (subir a Firebase Console)
3. ❌ Focus trap en modales — requerido para WCAG 2.1.2
4. ❌ Sanitizar onclick handlers con datos dinámicos

### Fase 2 — Arquitectura (siguiente sprint)
5. ❌ Separar monolitos: extraer CSS a `styles.css`, JS a `app.js`, config a `firebase-config.js`
6. ❌ Unificar `renderAdminCalendar` y `renderStudentCalendar` en una función
7. ❌ Gestión correcta de listeners `onSnapshot` (evitar fugas)

### Fase 3 — Accesibilidad observable
8. ❌ Añadir `aria-label` a botones icono (check, times, eye, pencil, trash)
9. ❌ Añadir `role="dialog" aria-modal="true"` a todos los modales
10. ❌ Añadir `prefers-reduced-motion`
11. ❌ Añadir skip link

### Fase 4 — DevOps y calidad
12. ✅ ~~Workflow CI renombrado~~ — **CORREGIDO**
13. ❌ Configurar ESLint + Prettier
14. ❌ Tests end-to-end con Playwright
15. ❌ Migrar a Vite/bundler (eliminar dependencias CDN)
16. ❌ Subir `firestore.rules` a Firebase Console
