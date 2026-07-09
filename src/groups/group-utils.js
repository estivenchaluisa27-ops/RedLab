/**
 * src/groups/group-utils.js — Utilidades para búsqueda de miembros de grupo
 */

/**
 * Busca miembros de un grupo por nombre dentro de un curso.
 * @param {FirebaseFirestore} db
 * @param {string} courseId
 * @param {string} groupName
 * @returns {Promise<Array>} Array de miembros o array vacío
 */
export async function lookupMembersByGroupName(db, courseId, groupName) {
  if (!courseId) return [];
  try {
    const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
    const q = query(collection(db, "courses", courseId, "groups"), where("name", "==", groupName));
    const gSnap = await getDocs(q);
    if (!gSnap.empty) {
      return gSnap.docs[0].data().members || [];
    }
  } catch (e) {
    console.error("Error fetching members", e);
  }
  return [];
}
