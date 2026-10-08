/**
 * src/courses/courses.js — CRUD de cursos (crear, editar)
 * Fase B: las vistas de Nuevo/Editar Curso ahora son sub-vistas del router,
 *           no modales. openCreateCourseModal/openEditCourseModal pasan a ser
 *           setup functions invocadas por el admin-router-controller.
 */
import { collection, doc, getDoc, getDocs, updateDoc, setDoc, query, where, writeBatch, deleteDoc } from '../firebase-config.js';
import { escapeHtml, escapeAttr } from '../utils/escape.js';
import { buildCourseId } from './course-utils.js';
import { alert as notifyAlert, notifyConfirm } from '../utils/notify.js';
import { navigate } from '../router.js';

let _db = null;
let _state = null;

export function initCourses(db, state) {
  _db = db;
  _state = state;
}

/**
 * Tras crear el curso exitosamente, navega de vuelta a la lista de cursos.
 */
export async function createCourse(e) {
  e.preventDefault();

  const subjectVal = document.getElementById('c-subject').value;
  const parallelVal = document.getElementById('c-parallel').value;
  const subject = subjectVal.trim();
  const career = document.getElementById('c-career').value.trim();
  const parallel = parallelVal.trim();
  const limit = parseInt(document.getElementById('c-limit').value);
  const professor = document.getElementById('c-professor').value;

  const customId = buildCourseId(subject, parallel);

  if (!await notifyConfirm(`¿Confirmar creación?\n\nEl ID en base de datos será: "${customId}"`)) {
    return;
  }

  try {
    await setDoc(doc(_db, "courses", customId), {
      subject, parallel, career, weeklyLimit: limit,
      professorEmail: professor
    });
    notifyAlert("Curso creado.");
    // Limpiar form para próxima visita y volver a la lista.
    document.getElementById('c-subject').value = '';
    document.getElementById('c-parallel').value = '';
    document.getElementById('c-career').value = '';
    document.getElementById('c-limit').value = '4';
    navigate('#/admin/cursos');
  } catch (err) {
    notifyAlert("Error crítico: " + err.message);
  }
}

/**
 * Setup de la sub-view 'curso-editar'. Recibe params con courseId.
 * Carga los datos del curso y popula el form. Es llamado por el router
 * cada vez que se entra a #/admin/cursos/:courseId/editar.
 */
export async function setupEditCourseView(params) {
  const courseId = params && params.courseId;
  if (!courseId) {
    notifyAlert("Curso no especificado.");
    navigate('#/admin/cursos');
    return;
  }
  try {
    document.getElementById('edit-course-id').value = courseId;

    let courseData = _state.coursesCache[courseId];
    if (!courseData) {
      const docSnap = await getDoc(doc(_db, "courses", courseId));
      if (!docSnap.exists()) {
        notifyAlert("El curso no existe.");
        navigate('#/admin/cursos');
        return;
      }
      courseData = docSnap.data();
    }

    document.getElementById('e-subject').value = courseData.subject;
    document.getElementById('e-parallel').value = courseData.parallel;
    document.getElementById('e-limit').value = courseData.weeklyLimit || 4;

    const profSelect = document.getElementById('e-professor');
    profSelect.innerHTML = '<option value="">Cargando...</option>';
    const profSnaps = await getDocs(collection(_db, "professors"));
    profSelect.innerHTML = '';

    profSnaps.forEach(p => {
      const pData = p.data();
      const isSelected = p.id === courseData.professorEmail ? 'selected' : '';
      profSelect.innerHTML += `<option value="${escapeAttr(p.id)}" ${isSelected}>${escapeHtml(pData.name)}</option>`;
    });
  } catch (e) {
    console.error(e);
    notifyAlert("Error: " + e.message);
  }
}

export async function saveCourseChanges(e) {
  e.preventDefault();
  const courseId = document.getElementById('edit-course-id').value;
  const newSubject = document.getElementById('e-subject').value;
  const newParallel = document.getElementById('e-parallel').value;
  const newLimit = parseInt(document.getElementById('e-limit').value);
  const newProfEmail = document.getElementById('e-professor').value;

  try {
    await updateDoc(doc(_db, "courses", courseId), {
      subject: newSubject,
      parallel: newParallel,
      weeklyLimit: newLimit,
      professorEmail: newProfEmail
    });

    notifyAlert("Curso actualizado.");

    if (_state.coursesCache[courseId]) {
      Object.assign(_state.coursesCache[courseId], { subject: newSubject, parallel: newParallel, weeklyLimit: newLimit, professorEmail: newProfEmail });
    }
    // Volver a la lista de cursos tras guardar.
    navigate('#/admin/cursos');
  } catch (err) {
    notifyAlert("Error al guardar: " + err.message);
  }
}

/**
 * Solo el admin puede eliminar cursos: el profesor es solo-lectura en esta
 * vista (el item del menu ni siquiera se le pinta). Las reglas de Firestore
 * lo respaldan (`allow delete iff isAdmin`, firestore.rules).
 * @param {string} role rol de `_state.role`
 * @returns {boolean} true solo para 'admin'
 */
export function canDeleteCourse(role) {
  return role === 'admin';
}

/**
 * Plan de borrado en cascada de un curso, en orden de ejecución: primero las
 * colecciones huérfanas (Firestore nunca borra subcolecciones con el padre)
 * y el documento del curso al final. Es puro para poder testearlo sin Firestore.
 * @param {string} courseId
 * @returns {Array<{ kind: string, target: string }>}
 */
export function buildCourseDeletionPlan(courseId) {
  return [
    { kind: 'subcollection', target: `courses/${courseId}/groups` },
    { kind: 'query', target: `reservations where courseId == ${courseId}` },
    { kind: 'query', target: `student_directory where courseId == ${courseId}` },
    { kind: 'doc', target: `courses/${courseId}` },
  ];
}

/**
 * Trocea un arreglo en lotes de `size` elementos (por defecto 400, con
 * margen bajo el límite de 500 escrituras por batch de Firestore). Puro:
 * no muta la entrada. Se usa en el borrado en cascada para que un curso
 * con >500 docs en un bucket (p. ej. reservas de un semestre) no falle
 * el commit() a mitad de cascada.
 * @param {Array} items
 * @param {number} [size=400]
 * @returns {Array<Array>}
 */
export function chunkArray(items, size = 400) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const chunkSize = Number.isInteger(size) && size > 0 ? size : 400;
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Elimina un curso y sus datos huérfanos (grupos, reservas, directorio),
 * siguiendo el patrón batch de deleteGroup (groups.js): confirmación,
 * borrados por lote y alerta de éxito. Solo admin (guardia + reglas).
 * @param {string} courseId
 */
export async function deleteCourse(courseId) {
  if (!canDeleteCourse(_state && _state.role)) return;
  if (!courseId) {
    notifyAlert("Curso no especificado.");
    return;
  }

  const courseName = _state.coursesCache[courseId] ? _state.coursesCache[courseId].subject : courseId;
  if (!await notifyConfirm(`¿Eliminar el curso "${courseName}"?\n\nSe borrarán sus grupos, reservas y estudiantes asociados. Esta acción no se puede deshacer.`)) {
    return;
  }

  try {
    // 1. Subcolección courses/{id}/groups/* (getDocs + batch: Firestore no
    //    borra subcolecciones con el padre). Un batch por trozo: Firestore
    //    limita a 500 escrituras por commit.
    const groupsSnap = await getDocs(collection(_db, "courses", courseId, "groups"));
    if (!groupsSnap.empty) {
      const groupDocs = [];
      groupsSnap.forEach(d => groupDocs.push(d));
      for (const chunk of chunkArray(groupDocs)) {
        const batch = writeBatch(_db);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }

    // 2. Reservas huérfanas (where courseId == id, igualdad simple: sin índice nuevo).
    const reservationsSnap = await getDocs(query(
      collection(_db, "reservations"),
      where("courseId", "==", courseId)
    ));
    if (!reservationsSnap.empty) {
      const reservationDocs = [];
      reservationsSnap.forEach(d => reservationDocs.push(d));
      for (const chunk of chunkArray(reservationDocs)) {
        const batch = writeBatch(_db);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }

    // 3. Directorio estudiantil huérfano (where courseId == id, igualdad simple).
    const directorySnap = await getDocs(query(
      collection(_db, "student_directory"),
      where("courseId", "==", courseId)
    ));
    if (!directorySnap.empty) {
      const directoryDocs = [];
      directorySnap.forEach(d => directoryDocs.push(d));
      for (const chunk of chunkArray(directoryDocs)) {
        const batch = writeBatch(_db);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }

    // 4. El documento del curso, al final.
    await deleteDoc(doc(_db, "courses", courseId));

    if (_state.coursesCache[courseId]) {
      delete _state.coursesCache[courseId];
    }
    notifyAlert("Curso eliminado.");
  } catch (err) {
    notifyAlert("Error al eliminar: " + err.message);
  }
}
