/**
 * src/users/csv-import.js — Parseo de CSV de matrícula + alta por lotes
 *
 * Formato CSV: email,cedula,nombre,cursoId,grupo
 * - Idempotente: re-importar actualiza los datos existentes.
 * - Puro (parseo) + efecto (alta por lotes con buildGroupPayload).
 */
import { writeBatch, doc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { normalizeEmail } from '../utils/uce-email.js';
import { buildGroupPayload } from '../utils/groups-helpers.js';

/**
 * Parsea un CSV de matrícula.
 * Formato esperado: email,cedula,nombre,cursoId,grupo
 * @param {string} csvText
 * @returns {{ rows: Array<{email: string, cedula: string, nombre: string, courseId: string, grupo: string}>, errors: Array<{line: number, message: string}> }}
 */
export function parseMatriculaCSV(csvText) {
  const rows = [];
  const errors = [];
  const lines = csvText.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Saltar línea de cabecera
    if (i === 0 && /^email\s*,/i.test(line)) continue;

    const cols = line.split(',').map((c) => c.trim());
    if (cols.length < 5) {
      errors.push({ line: i + 1, message: `Se esperaban 5 columnas, hay ${cols.length}` });
      continue;
    }

    const [email, cedula, nombre, cursoId, grupo] = cols;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      errors.push({ line: i + 1, message: 'Email vacío o inválido' });
      continue;
    }
    if (!cedula) {
      errors.push({ line: i + 1, message: 'Cédula requerida' });
      continue;
    }
    if (!nombre) {
      errors.push({ line: i + 1, message: 'Nombre requerido' });
      continue;
    }
    if (!cursoId) {
      errors.push({ line: i + 1, message: 'Curso requerido' });
      continue;
    }
    if (!grupo) {
      errors.push({ line: i + 1, message: 'Grupo requerido' });
      continue;
    }

    rows.push({ email: normalizedEmail, cedula, nombre, cursoId, grupo });
  }

  return { rows, errors };
}

/**
 * Ejecuta el alta por lotes de estudiantes parseados.
 * Idempotente: re-importar actualiza los datos existentes.
 * Reutiliza buildGroupPayload para construir los datos de grupo y directorio.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {Array<{email: string, cedula: string, nombre: string, courseId: string, grupo: string}>} rows
 * @param {object} coursesCache — cache de cursos para resolver courseName
 * @returns {{ success: number, errors: Array<{email: string, message: string}> }}
 */
export async function importMatriculaBatch(db, rows, coursesCache = {}) {
  const errors = [];
  let success = 0;

  // Firestore limita 500 operaciones por batch. 2 ops/fila → 400 ≤ 500.
  const CHUNK_SIZE = 200;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const row of chunk) {
      try {
        const courseName = coursesCache?.[row.cursoId]?.subject || row.cursoId;
        const payload = buildGroupPayload({
          name: row.grupo,
          email: row.email,
          cedula: row.cedula,
          fullName: row.nombre,
          courseId: row.cursoId,
          courseName,
        });

        // 1. Crear/actualizar grupo (con miembro)
        const groupRef = doc(db, ...payload.groupRef);
        batch.set(groupRef, payload.groupData, { merge: true });

        // 2. Crear/actualizar directorio
        const dirRef = doc(db, 'student_directory', row.email);
        batch.set(dirRef, payload.dirData, { merge: true });

        success++;
      } catch (err) {
        errors.push({ email: row.email, message: err.message });
      }
    }

    try {
      await batch.commit();
    } catch (err) {
      // Si el batch completo falla, marcar todos como error
      for (const row of chunk) {
        errors.push({ email: row.email, message: err.message });
      }
      success -= chunk.length;
    }
  }

  return { success, errors };
}
