/**
 * src/courses/courses.js — CRUD de cursos (crear, editar)
 * Fase B: las vistas de Nuevo/Editar Curso ahora son sub-vistas del router,
 *           no modales. openCreateCourseModal/openEditCourseModal pasan a ser
 *           setup functions invocadas por el admin-router-controller.
 */
import { collection, doc, getDoc, getDocs, updateDoc, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHtml } from '../utils/escape.js';
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
    await addDoc(collection(_db, "courses"), {
      subject, parallel, career, weeklyLimit: limit,
      professorEmail: professor, id: customId
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
      profSelect.innerHTML += `<option value="${p.id}" ${isSelected}>${escapeHtml(pData.name)}</option>`;
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
