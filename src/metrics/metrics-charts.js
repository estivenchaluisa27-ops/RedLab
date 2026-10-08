/**
 * src/metrics/metrics-charts.js — Único adaptador de Chart.js de la app.
 *
 * Ningún otro módulo de métricas toca Chart.js directamente: la vista pide
 * diagramas de barras con datos ya agregados y este módulo los pinta.
 *
 * Chart.js NO es dependencia npm (no se añade nada al package.json): se
 * carga perezosamente desde CDN fijado la primera vez que se entra a la
 * sección Métricas, igual que xlsx/Swal ya se cargan por CDN en index.html.
 * Si la carga falla (sin conexión), se resuelve null y la vista muestra la
 * tabla de datos con un aviso en lugar del diagrama.
 */

const CHART_JS_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';

// Paleta UCE: azul institucional, azul claro y dorado, más apoyos.
const PALETTE = ['#004274', '#0e6ba8', '#d1b610', '#2f855a', '#9c4221', '#6b7280'];

let _loadPromise = null;
const _charts = new Map();

/**
 * Carga Chart.js una sola vez (no-op si ya está disponible).
 * @returns {Promise<object|null>} window.Chart o null si no se pudo cargar.
 */
export function ensureChartJs() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.Chart) return Promise.resolve(window.Chart);
  if (_loadPromise) return _loadPromise;
  _loadPromise = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = CHART_JS_CDN;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.Chart || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return _loadPromise;
}

/**
 * Pinta (o repinta) un diagrama de barras en un canvas.
 * Destruye la instancia previa de ese canvas para no apilar gráficos al
 * re-entrar a la sección.
 * @param {HTMLCanvasElement|null} canvas
 * @param {{ labels: string[], values: number[], label: string }} data
 * @returns {object|null} instancia Chart o null si Chart.js no está listo.
 */
export function renderBarChart(canvas, { labels, values, label }) {
  if (!canvas || typeof window === 'undefined' || !window.Chart) return null;
  const key = canvas.id || canvas;
  const prev = _charts.get(key);
  if (prev) {
    try { prev.destroy(); } catch (_) { /* noop: destruir instancia previa */ }
    _charts.delete(key);
  }
  const chart = new window.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels || [],
      datasets: [{
        label: label || '',
        data: values || [],
        backgroundColor: (labels || []).map((_, i) => PALETTE[i % PALETTE.length]),
        borderColor: (labels || []).map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
  _charts.set(key, chart);
  return chart;
}

/**
 * Destruye todos los diagramas de métricas (limpieza al salir/re-entrar).
 */
export function destroyMetricsCharts() {
  for (const chart of _charts.values()) {
    try { chart.destroy(); } catch (_) { /* noop: limpieza best-effort */ }
  }
  _charts.clear();
}
