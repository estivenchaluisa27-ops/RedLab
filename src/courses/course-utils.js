/**
 * src/courses/course-utils.js — Utilidades para construcción de IDs de cursos
 */

/**
 * Construye un ID de curso a partir de materia y paralelo.
 * Formato: MATERIA_PARALELO (todo mayúsculas, sin espacios, solo alfanumérico y _)
 * @param {string} subject - Nombre de la materia
 * @param {string} parallel - Paralelo
 * @returns {string}
 */
export function buildCourseId(subject, parallel) {
  const cleanSubject = subject.toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');

  const cleanParallel = parallel.toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, '');

  return `${cleanSubject}_${cleanParallel}`;
}
