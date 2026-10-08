/**
 * src/metrics/metrics-queries.js — Lecturas Firestore para Métricas.
 *
 * Única responsabilidad: traer reservas APROBADAS en un rango de fechas.
 * No toca el DOM ni agrega estado de módulo: recibe `db` por parámetro.
 *
 * Patrón tomado de src/reports/reports.js: rango con where(date>=,<=) más
 * where(status==approved); el filtro por curso se hace en memoria para no
 * exigir índices compuestos nuevos. La regla de lectura de reservations
 * (firestore.rules) permite approved/blocked a admin y profesor, así que la
 * misma query es segura para ambos roles.
 */
import { collection, query, where, getDocs } from '../firebase-config.js';

/**
 * Lee las reservas aprobadas entre dos fechas inclusivas ('YYYY-MM-DD').
 * @param {*} db — instancia Firestore
 * @param {string} startStr
 * @param {string} endStr
 * @returns {Promise<Array<object>>} docs planos { id, ...data }
 */
export async function fetchApprovedReservations(db, startStr, endStr) {
  const q = query(
    collection(db, 'reservations'),
    where('date', '>=', startStr),
    where('date', '<=', endStr),
    where('status', '==', 'approved')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
