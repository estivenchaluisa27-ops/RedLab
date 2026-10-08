/**
 * src/metrics/metrics-aggregate.js — Agregación pura de métricas de reservas.
 *
 * Capa sin DOM ni Firebase: recibe documentos planos de reservas (ya leídos
 * de Firestore por metrics-queries.js) y devuelve conteos listos para la
 * vista y los diagramas.
 *
 * Convenciones:
 *   - Solo cuentan reservas APROBADAS. La query ya filtra status==approved;
 *     por defensa, los docs que traigan `status` distinto de 'approved' se
 *     ignoran (los docs sin campo `status`, ej. mocks, sí cuentan).
 *   - Horas = conteo de documentos aprobados (1 doc = 1 hora de laboratorio).
 *   - Las fechas se comparan como strings 'YYYY-MM-DD' (orden lexicográfico
 *     válido en ese formato).
 *
 * Salidas:
 *   - por grupo por semana, por grupo por mes y ranking general del período.
 */

/** Valor del filtro de curso que significa "todos los cursos visibles". */
export const ALL_COURSES = 'ALL';

/** Etiqueta para reservas aprobadas sin nombre de grupo. */
export const UNGROUPED_LABEL = 'Sin grupo';

/**
 * Filtra reservas a un rango de fechas inclusivo ('YYYY-MM-DD').
 * @param {Array<object>} docs
 * @param {string} start
 * @param {string} end
 * @returns {Array<object>}
 */
export function filterByDateRange(docs, start, end) {
  if (!Array.isArray(docs)) return [];
  return docs.filter(d => typeof d?.date === 'string' && d.date >= start && d.date <= end);
}

/**
 * Filtra reservas a un curso. ALL_COURSES (o valor falsy) no filtra.
 * @param {Array<object>} docs
 * @param {string} courseId
 * @returns {Array<object>}
 */
export function filterByCourse(docs, courseId) {
  if (!Array.isArray(docs)) return [];
  if (!courseId || courseId === ALL_COURSES) return [...docs];
  return docs.filter(d => d?.courseId === courseId);
}

/**
 * Cuenta horas (docs aprobados) por grupo.
 * @param {Array<object>} docs
 * @returns {{ [group: string]: number }}
 */
export function countByGroup(docs) {
  const counts = {};
  if (!Array.isArray(docs)) return counts;
  for (const d of docs) {
    if (!d) continue;
    // Defensa: si el doc trae status y no es approved, no cuenta.
    if (d.status != null && d.status !== 'approved') continue;
    if (typeof d.date !== 'string' || !d.date) continue;
    const group = d.groupName || UNGROUPED_LABEL;
    counts[group] = (counts[group] || 0) + 1;
  }
  return counts;
}

/**
 * Convierte un mapa { grupo: horas } en ranking ordenado: horas desc,
 * desempate por nombre de grupo asc.
 * @param {{ [group: string]: number }} counts
 * @returns {Array<{ group: string, hours: number }>}
 */
export function toRanking(counts) {
  return Object.entries(counts || {})
    .map(([group, hours]) => ({ group, hours }))
    .sort((a, b) => (b.hours - a.hours) || String(a.group).localeCompare(String(b.group)));
}

/**
 * Agrega métricas semanales, mensuales y ranking general.
 * @param {Array<object>} docs — reservas (idealmente ya aprobadas y del curso)
 * @param {{ weekStart: string, weekEnd: string, monthStart: string, monthEnd: string }} ranges
 * @returns {{
 *   weeklyByGroup: Array<{ group: string, hours: number }>,
 *   monthlyByGroup: Array<{ group: string, hours: number }>,
 *   ranking: Array<{ group: string, hours: number }>
 * }}
 */
export function aggregateMetrics(docs, ranges) {
  const list = Array.isArray(docs) ? docs : [];
  const { weekStart, weekEnd, monthStart, monthEnd } = ranges || {};
  const weeklyByGroup = weekStart && weekEnd
    ? toRanking(countByGroup(filterByDateRange(list, weekStart, weekEnd)))
    : [];
  const monthlyByGroup = monthStart && monthEnd
    ? toRanking(countByGroup(filterByDateRange(list, monthStart, monthEnd)))
    : [];
  // Ranking: total de horas aprobadas del período consultado (unión de rangos).
  const ranking = toRanking(countByGroup(list));
  return { weeklyByGroup, monthlyByGroup, ranking };
}
