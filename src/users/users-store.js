/**
 * src/users/users-store.js — CRUD de admins/professors + directorio de estudiantes
 *
 * Colecciones Firestore:
 *   admins/{email}     = { name, email, createdAt }
 *   professors/{email}  = { name, email, createdAt }
 *   student_directory/{email} = { courseId, courseName, email, groupId, role }
 *
 * Reglas de protección:
 *   - Un admin NO puede eliminarse a sí mismo.
 *   - Debe existir SIEMPRE al menos 1 admin.
 *   - JAMÁS se llama deleteUser de Auth: las cuentas Auth huérfanas se borran
 *     en Firebase Console (banner permanente en la UI).
 */
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { normalizeEmail } from '../utils/uce-email.js';
import { buildOrphanCleanupQuery } from '../utils/groups-helpers.js';
import { clearGroupUtilsCache } from '../groups/group-utils.js';

let _db = null;
let _state = null;

export function initUsuarios(db, state) {
  _db = db;
  _state = state;
}

// ─── Admins ──────────────────────────────────────────────────────────────────

/**
 * Lista todos los admins.
 * @returns {Promise<Array<{email: string, name: string, createdAt: any}>>}
 */
export async function listAdmins() {
  const snap = await getDocs(collection(_db, 'admins'));
  const list = [];
  snap.forEach((d) => {
    list.push({ email: d.id, ...d.data() });
  });
  return list;
}

/**
 * Crea o actualiza un admin.
 * @param {string} email
 * @param {string} name
 */
export async function saveAdmin(email, name) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error('Email requerido');
  await setDoc(doc(_db, 'admins', normalized), {
    name: name || normalized,
    email: normalized,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Elimina un admin. Protecciones:
 *   - No puede eliminarse a sí mismo.
 *   - Debe quedar al menos 1 admin.
 * @param {string} email
 * @param {string} currentEmail — email del admin que ejecuta la acción
 */
export async function deleteAdmin(email, currentEmail) {
  const normalized = normalizeEmail(email);
  const current = normalizeEmail(currentEmail);

  if (normalized === current) {
    throw new Error('No puedes eliminarte a ti mismo.');
  }

  const all = await listAdmins();
  if (all.length <= 1) {
    throw new Error('Debe existir al menos 1 admin.');
  }

  await deleteDoc(doc(_db, 'admins', normalized));
}

// ─── Professors ──────────────────────────────────────────────────────────────

/**
 * Lista todos los profesores.
 * @returns {Promise<Array<{email: string, name: string, createdAt: any}>>}
 */
export async function listProfessors() {
  const snap = await getDocs(collection(_db, 'professors'));
  const list = [];
  snap.forEach((d) => {
    list.push({ email: d.id, ...d.data() });
  });
  return list;
}

/**
 * Crea o actualiza un profesor.
 * @param {string} email
 * @param {string} name
 */
export async function saveProfessor(email, name) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error('Email requerido');
  await setDoc(doc(_db, 'professors', normalized), {
    name: name || normalized,
    email: normalized,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Elimina un profesor.
 * @param {string} email
 */
export async function deleteProfessor(email) {
  const normalized = normalizeEmail(email);
  await deleteDoc(doc(_db, 'professors', normalized));
}

// ─── Student Directory ────────────────────────────────────────────────────────

/**
 * Lista el directorio de estudiantes con filtro opcional por curso y búsqueda por email.
 * @param {{ courseId?: string, search?: string }} [filters]
 * @returns {Promise<Array<object>>}
 */
export async function listStudentDirectory(filters = {}) {
  const { courseId, search } = filters;
  let q = collection(_db, 'student_directory');

  if (courseId) {
    q = query(q, where('courseId', '==', courseId));
  }

  const snap = await getDocs(q);
  let list = [];
  snap.forEach((d) => {
    list.push({ email: d.id, ...d.data() });
  });

  if (search) {
    const s = normalizeEmail(search);
    list = list.filter((item) => item.email.includes(s));
  }

  return list;
}

/**
 * Mueve un estudiante a otro grupo.
 * Actualiza: student_directory + members del grupo origen + members del grupo destino.
 * @param {string} email
 * @param {string} targetCourseId
 * @param {string} targetGroupId
 */
export async function moveStudent(email, targetCourseId, targetGroupId) {
  const normalized = normalizeEmail(email);
  const dirSnap = await getDoc(doc(_db, 'student_directory', normalized));
  if (!dirSnap.exists()) throw new Error('Estudiante no encontrado');

  const dirData = dirSnap.data();
  const sourceCourseId = dirData.courseId;
  const sourceGroupId = dirData.groupId;

  // Obtener datos del estudiante del grupo origen
  const sourceGroupSnap = await getDoc(
    doc(_db, 'courses', sourceCourseId, 'groups', sourceGroupId)
  );
  if (!sourceGroupSnap.exists()) throw new Error('Grupo origen no encontrado');

  const sourceGroupData = sourceGroupSnap.data();
  const member = (sourceGroupData.members || []).find(
    (m) => m.email === normalized || m.nombre === dirData.name
  );
  if (!member) throw new Error('Miembro no encontrado en grupo origen');

  // Obtener datos del grupo destino
  const targetGroupSnap = await getDoc(
    doc(_db, 'courses', targetCourseId, 'groups', targetGroupId)
  );
  if (!targetGroupSnap.exists()) throw new Error('Grupo destino no encontrado');

  const targetGroupData = targetGroupSnap.data();
  const targetCourseName = _state.coursesCache?.[targetCourseId]?.subject || targetCourseId;

  const batch = writeBatch(_db);

  // 1. Eliminar miembro del grupo origen
  const updatedSourceMembers = (sourceGroupData.members || []).filter(
    (m) => m.email !== normalized
  );
  batch.set(
    doc(_db, 'courses', sourceCourseId, 'groups', sourceGroupId),
    { ...sourceGroupData, members: updatedSourceMembers },
    { merge: true }
  );

  // 2. Agregar miembro al grupo destino
  const updatedTargetMembers = [
    ...(targetGroupData.members || []),
    { cedula: member.cedula, nombre: member.nombre, isLeader: false },
  ];
  batch.set(
    doc(_db, 'courses', targetCourseId, 'groups', targetGroupId),
    { ...targetGroupData, members: updatedTargetMembers },
    { merge: true }
  );

  // 3. Actualizar directorio
  batch.set(
    doc(_db, 'student_directory', normalized),
    {
      courseId: targetCourseId,
      courseName: targetCourseName,
      email: normalized,
      groupId: targetGroupId,
      role: 'student',
    },
    { merge: true }
  );

  await batch.commit();
  clearGroupUtilsCache();
}

/**
 * Elimina un estudiante del directorio.
 * Revoca login (patrón auth.js:77) + limpia reservas huérfanas.
 * JAMÁS llama deleteUser de Auth.
 * @param {string} email
 */
export async function deleteStudent(email) {
  const normalized = normalizeEmail(email);
  const dirSnap = await getDoc(doc(_db, 'student_directory', normalized));
  if (!dirSnap.exists()) throw new Error('Estudiante no encontrado');

  const dirData = dirSnap.data();
  const { courseId, groupId } = dirData;

  // Obtener nombre del grupo para limpieza de reservas
  const groupSnap = await getDoc(doc(_db, 'courses', courseId, 'groups', groupId));
  const groupName = groupSnap.exists() ? groupSnap.data().name : null;

  const batch = writeBatch(_db);

  // 1. Eliminar del directorio
  batch.delete(doc(_db, 'student_directory', normalized));

  // 2. Eliminar miembro del grupo
  if (groupSnap.exists()) {
    const groupData = groupSnap.data();
    const updatedMembers = (groupData.members || []).filter(
      (m) => m.email !== normalized
    );
    batch.set(
      doc(_db, 'courses', courseId, 'groups', groupId),
      { ...groupData, members: updatedMembers },
      { merge: true }
    );
  }

  await batch.commit();

  // 3. Limpiar reservas huérfanas (vía descriptor de groups-helpers)
  if (groupName) {
    const cleanupQuery = buildOrphanCleanupQuery(courseId, groupName);
    const reservationsSnap = await getDocs(
      query(collection(_db, cleanupQuery.collection), where('groupName', '==', groupName), where('courseId', '==', courseId))
    );
    if (!reservationsSnap.empty) {
      const cleanupBatch = writeBatch(_db);
      reservationsSnap.forEach((d) => cleanupBatch.delete(d.ref));
      await cleanupBatch.commit();
    }
  }

  clearGroupUtilsCache();
}
