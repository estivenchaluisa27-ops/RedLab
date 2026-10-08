/**
 * src/metrics/metrics-view.js — Vista Métricas (solo lectura).
 *
 * Muestra reservas de laboratorio APROBADAS por grupo, por semana y por mes,
 * con filtro por curso y diagramas de barras. Visible para admin y profesor;
 * el profesor solo ve sus propios cursos (filtro por professorEmail, patrón
 * de src/courses/courses-list.js). Nunca muta datos: no usa data-action,
 * cablea sus propios listeners del DOM.
 *
 * Entrada: setupMetricasView(db, state), registrada en main.js con
 * rerunOnEveryEnter para refrescar al volver a la sección.
 */
import { fetchApprovedReservations } from './metrics-queries.js';
import { aggregateMetrics, filterByCourse, ALL_COURSES } from './metrics-aggregate.js';
import { ensureChartJs, renderBarChart, destroyMetricsCharts } from './metrics-charts.js';
import { getWeekDays, formatDateYYYYMMDD } from '../utils/dates.js';
import { escapeHtml, escapeAttr } from '../utils/escape.js';
import { showSkeleton } from '../utils/skeleton.js';
import { animateListIn } from '../utils/motion.js';
import { hasCoursesLoaded } from '../courses/courses-list.js';

let _db = null;
let _state = null;
let _wired = false;
let _activeRange = 'week'; // 'week' | 'month'
let _lastDocs = [];
let _lastRanges = null;
// Un solo reintento diferido cuando se entra directo por hash antes de que
// cargue el caché de cursos: un timer a la vez, sin polling ni listeners.
let _retryTimer = null;
let _loadingRetryDone = false;

const RANKING_LIMIT = 10;

/**
 * Cursos visibles según rol: admin ve todos; profesor solo los propios.
 * @returns {Array<[string, object]>} pares [courseId, course]
 */
function visibleCourses() {
  const cache = _state?.coursesCache || {};
  const entries = Object.entries(cache);
  if (_state?.role === 'professor') {
    const email = _state?.user?.email;
    return entries.filter(([, c]) => c?.professorEmail === email);
  }
  return entries;
}

/** Etiqueta "Materia (Paralelo)" de un curso. */
function courseLabel(course) {
  const subject = course?.subject || 'Sin nombre';
  const parallel = course?.parallel ? ` (${course.parallel})` : '';
  return `${subject}${parallel}`;
}

/** 'YYYY-MM-DD' → 'DD/MM/AAAA' para etiquetas en español. */
function toDisplayDate(yyyyMMdd) {
  const [y, m, d] = String(yyyyMMdd).split('-');
  return `${d}/${m}/${y}`;
}

/** Semana actual (lun–vie) y mes actual (día 1 → hoy), patrón de reports. */
function computeRanges() {
  const days = getWeekDays(0);
  const weekStart = formatDateYYYYMMDD(days[0]);
  const weekEnd = formatDateYYYYMMDD(days[days.length - 1]);
  const today = new Date();
  const monthStart = formatDateYYYYMMDD(new Date(today.getFullYear(), today.getMonth(), 1));
  const monthEnd = formatDateYYYYMMDD(today);
  return { weekStart, weekEnd, monthStart, monthEnd };
}

function setToggleStyles() {
  const weekBtn = document.getElementById('met-range-week');
  const monthBtn = document.getElementById('met-range-month');
  if (!weekBtn || !monthBtn) return;
  const active = ['bg-uce-700', 'text-white', 'font-bold'];
  const idle = ['border', 'border-slate-300', 'text-slate-600'];
  const base = ['px-4', 'py-2', 'rounded', 'text-sm', 'transition'];
  for (const [btn, isActive] of [[weekBtn, _activeRange === 'week'], [monthBtn, _activeRange === 'month']]) {
    btn.classList.remove(...active, ...idle);
    btn.classList.add(...base, ...(isActive ? active : idle));
    btn.setAttribute('aria-pressed', String(isActive));
  }
}

function showOnly(...idsToShow) {
  for (const id of ['met-skeleton', 'met-empty', 'met-results']) {
    document.getElementById(id)?.classList.toggle('hidden', !idsToShow.includes(id));
  }
}

function showError(message) {
  showOnly('met-empty');
  const empty = document.getElementById('met-empty');
  if (empty) empty.textContent = message;
}

/** Reconstruye el select de cursos preservando la selección si sigue válida. */
function buildCourseOptions() {
  const sel = document.getElementById('met-course-filter');
  if (!sel) return;
  const prev = sel.value;
  const courses = visibleCourses();
  const isAdmin = _state?.role === 'admin';

  if (courses.length === 0) {
    sel.innerHTML = hasCoursesLoaded()
      ? '<option value="">No hay cursos registrados</option>'
      : '<option value="">Cargando cursos…</option>';
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  let html = '';
  if (isAdmin || courses.length > 1) {
    html += `<option value="${ALL_COURSES}">${isAdmin ? 'Todos los cursos' : 'Todos mis cursos'}</option>`;
  }
  for (const [id, course] of courses) {
    html += `<option value="${escapeAttr(id)}">${escapeHtml(courseLabel(course))}</option>`;
  }
  sel.innerHTML = html;
  const stillValid = Array.from(sel.options).some(o => o.value === prev);
  sel.value = stillValid ? prev : sel.options[0].value;
}

/** Docs del fetch restringidos a los cursos visibles + filtro del select. */
function applyCourseFilter() {
  const visibleIds = new Set(visibleCourses().map(([id]) => id));
  const sel = document.getElementById('met-course-filter');
  const selected = sel?.value || ALL_COURSES;
  const inVisible = _lastDocs.filter(d => visibleIds.has(d?.courseId));
  return filterByCourse(inVisible, selected);
}

function updatePeriodLabel() {
  const el = document.getElementById('met-period-label');
  if (!el || !_lastRanges) return;
  const { weekStart, weekEnd, monthStart, monthEnd } = _lastRanges;
  el.textContent = `Semana actual: ${toDisplayDate(weekStart)} – ${toDisplayDate(weekEnd)} · `
    + `Mes actual: ${toDisplayDate(monthStart)} – ${toDisplayDate(monthEnd)}`;
}

function renderTable(rows) {
  const tbody = document.getElementById('met-table-body');
  const title = document.getElementById('met-table-title');
  if (!tbody) return;
  if (title) {
    title.textContent = _activeRange === 'week'
      ? 'Horas aprobadas por grupo · semana actual'
      : 'Horas aprobadas por grupo · mes actual';
  }
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" class="py-3 text-center text-sm text-slate-500 italic">Sin reservas aprobadas en este rango.</td></tr>';
    return;
  }
  const total = rows.reduce((acc, r) => acc + r.hours, 0);
  tbody.innerHTML = rows.map(r => `
    <tr class="border-t border-slate-100">
      <td class="py-2 pr-2 font-medium text-slate-700">${escapeHtml(r.group)}</td>
      <td class="py-2 text-right font-bold text-uce-700">${r.hours}</td>
    </tr>`).join('') + `
    <tr class="border-t-2 border-slate-200 bg-slate-50">
      <td class="py-2 pr-2 font-bold text-slate-700">Total</td>
      <td class="py-2 text-right font-bold text-uce-700">${total}</td>
    </tr>`;
  animateListIn(tbody);
}

function renderCharts(agg) {
  const charts = [
    { canvasId: 'met-chart-week', fallbackId: 'met-fallback-week', rows: agg.weeklyByGroup, label: 'Horas aprobadas por grupo · semana' },
    { canvasId: 'met-chart-month', fallbackId: 'met-fallback-month', rows: agg.monthlyByGroup, label: 'Horas aprobadas por grupo · mes' },
    { canvasId: 'met-chart-ranking', fallbackId: 'met-fallback-ranking', rows: agg.ranking.slice(0, RANKING_LIMIT), label: `Ranking de grupos · top ${RANKING_LIMIT}` },
  ];
  for (const { canvasId, fallbackId, rows, label } of charts) {
    const canvas = document.getElementById(canvasId);
    const fallback = document.getElementById(fallbackId);
    const chart = renderBarChart(canvas, {
      labels: rows.map(r => r.group),
      values: rows.map(r => r.hours),
      label,
    });
    canvas?.classList.toggle('hidden', !chart);
    if (fallback) {
      fallback.classList.toggle('hidden', !!chart);
      if (!chart) fallback.textContent = 'Diagrama no disponible sin conexión. Los datos están en la tabla.';
    }
  }
}

async function refresh(refetch = true) {
  if (!_db) return;
  const sel = document.getElementById('met-course-filter');
  if (!sel) return;

  buildCourseOptions();
  const courses = visibleCourses();
  if (courses.length === 0) {
    destroyMetricsCharts();
    const loaded = hasCoursesLoaded();
    showError(loaded
      ? 'No hay cursos para mostrar métricas.'
      : 'Cargando cursos…');
    if (!loaded && !_retryTimer && !_loadingRetryDone) {
      // El caché aún no llega (entrada directa por hash): un único reintento
      // diferido, sin polling.
      _loadingRetryDone = true;
      _retryTimer = setTimeout(() => {
        _retryTimer = null;
        // La sección pudo desmontarse al navegar fuera: no refrescar entonces.
        if (!document.getElementById('met-course-filter')) return;
        refresh(true).catch(e => {
          console.error('[metricas] refresh falló:', e);
        });
      }, 1500);
    }
    return;
  }
  _loadingRetryDone = false;
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }

  if (refetch) {
    _lastRanges = computeRanges();
    updatePeriodLabel();
    showOnly('met-skeleton');
    showSkeleton(document.getElementById('met-skeleton'), { variant: 'row', count: 5 });
    const start = _lastRanges.weekStart < _lastRanges.monthStart ? _lastRanges.weekStart : _lastRanges.monthStart;
    const end = _lastRanges.weekEnd > _lastRanges.monthEnd ? _lastRanges.weekEnd : _lastRanges.monthEnd;
    try {
      _lastDocs = await fetchApprovedReservations(_db, start, end);
    } catch (e) {
      console.error('[metricas] lectura de reservas falló:', e);
      destroyMetricsCharts();
      showError('No se pudieron cargar las reservas. Revisa tu conexión e inténtalo de nuevo.');
      return;
    }
  }

  const docs = applyCourseFilter();
  const agg = aggregateMetrics(docs, _lastRanges);
  const activeRows = _activeRange === 'week' ? agg.weeklyByGroup : agg.monthlyByGroup;

  if (agg.weeklyByGroup.length === 0 && agg.monthlyByGroup.length === 0) {
    destroyMetricsCharts();
    showError('Sin reservas aprobadas en el período para este filtro.');
    return;
  }

  showOnly('met-results');
  updatePeriodLabel();
  renderTable(activeRows);
  await ensureChartJs();
  renderCharts(agg);
}

function wireOnce() {
  if (_wired) return;
  _wired = true;
  document.getElementById('met-course-filter')?.addEventListener('change', () => refresh(false));
  document.getElementById('met-range-week')?.addEventListener('click', () => {
    if (_activeRange === 'week') return;
    _activeRange = 'week';
    setToggleStyles();
    refresh(false);
  });
  document.getElementById('met-range-month')?.addEventListener('click', () => {
    if (_activeRange === 'month') return;
    _activeRange = 'month';
    setToggleStyles();
    refresh(false);
  });
}

/**
 * Setup de la sección Métricas. Idempotente ante re-entradas: los listeners
 * se cablean una vez y cada entrada refresca los datos.
 * @param {*} db — instancia Firestore
 * @param {*} state — estado global (role, user, coursesCache)
 */
export function setupMetricasView(db, state) {
  _db = db || _db;
  _state = state || _state;
  if (!document.getElementById('met-course-filter')) return;
  setToggleStyles();
  wireOnce();
  refresh(true).catch(e => {
    console.error('[metricas] refresh falló:', e);
    showError('No se pudieron cargar las métricas. Inténtalo de nuevo.');
  });
}

/** Alias de inyección con el nombre genérico del módulo. */
export function initMetricas(db, state) {
  setupMetricasView(db, state);
}
