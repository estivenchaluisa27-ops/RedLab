/**
 * src/utils/professors.js — Lectura de profesores para poblar <select>
 *
 * Extraído de src/courses/courses-list.js:151-157 y src/courses/courses.js:90-97.
 * Puro en datos (fetchProfessors) + helper DOM mínimo (loadProfessorsInto).
 * Ningún consumidor existente se modifica (P4 cableará).
 */
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHtml } from './escape.js';

/**
 * Lee la colección "professors" y devuelve [{ email, name }].
 * email = doc id, name = doc.data().name.
 * @param {*} db - Instancia Firestore
 * @returns {Promise<Array<{email: string, name: string}>>}
 */
export async function fetchProfessors(db) {
  const snap = await getDocs(collection(db, 'professors'));
  const list = [];
  snap.forEach((d) => {
    list.push({ email: d.id, name: d.data().name });
  });
  return list;
}

/**
 * Puebla un <select> con la lista de profesores.
 * Placeholder "Seleccione Profesor..." + opción selected si coincide con selectedEmail.
 * @param {*} db - Instancia Firestore
 * @param {HTMLSelectElement} selectEl - Elemento <select> a poblar
 * @param {string} [selectedEmail=''] - Email a marcar como selected
 * @returns {Promise<Array<{email: string, name: string}>>}
 */
export async function loadProfessorsInto(db, selectEl, selectedEmail = '') {
  if (!selectEl) return [];
  try {
    const list = await fetchProfessors(db);
    let html = '<option value="">Seleccione Profesor...</option>';
    for (const p of list) {
      const selected = p.email === selectedEmail ? ' selected' : '';
      html += `<option value="${escapeHtml(p.email)}"${selected}>${escapeHtml(p.name)}</option>`;
    }
    selectEl.innerHTML = html;
    return list;
  } catch (e) {
    console.error('Error cargando profesores:', e);
    return [];
  }
}
