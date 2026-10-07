/**
 * src/utils/groups-helpers.js — Constructores puros de payloads de alta/baja de grupo
 *
 * Extraído de src/groups/groups.js:93-113 (alta con batch) y :156-175 (baja +
 * limpieza de reservas huérfanas). Solo construyen datos; el commit con batch
 * lo hará P4. Ningún consumidor existente se modifica.
 */
import { normalizeEmail } from './uce-email.js';

/**
 * Construye el payload de alta de grupo.
 * Replica groups.js:addGroup — groupId = email del líder, courseName resuelto
 * por el llamador (coursesCache) y pasado como parámetro.
 * @param {object} params
 * @param {string} params.name - Nombre del grupo
 * @param {string} params.email - Correo del líder (se normaliza)
 * @param {string} params.cedula - Cédula del líder
 * @param {string} params.fullName - Nombre completo del líder
 * @param {string} params.courseId - ID del curso actual
 * @param {string} params.courseName - Nombre del curso (de coursesCache o courseId)
 * @returns {{groupRef: Array<string>, groupData: object, dirData: object}}
 */
export function buildGroupPayload({ name, email, cedula, fullName, courseId, courseName }) {
  const normalized = normalizeEmail(email);
  return {
    groupRef: ['courses', courseId, 'groups', normalized],
    groupData: {
      name,
      leader: { email: normalized, cedula, fullName },
      members: [{ cedula, nombre: fullName, isLeader: true }],
    },
    dirData: {
      courseId,
      courseName,
      email: normalized,
      groupId: normalized,
      role: 'student',
    },
  };
}

/**
 * Describe la query de limpieza de reservas huérfanas tras eliminar un grupo.
 * Replica groups.js:deleteGroup — where groupName == name + where courseId == id
 * sobre la colección "reservations". El commit con batch lo hará P4.
 * @param {string} courseId - ID del curso actual
 * @param {string} groupName - Nombre del grupo eliminado
 * @returns {{collection: string, filters: Array<{field: string, op: string, value: string}>}}
 */
export function buildOrphanCleanupQuery(courseId, groupName) {
  return {
    collection: 'reservations',
    filters: [
      { field: 'groupName', op: '==', value: groupName },
      { field: 'courseId', op: '==', value: courseId },
    ],
  };
}
