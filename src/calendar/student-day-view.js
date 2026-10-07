/**
 * src/calendar/student-day-view.js — Vista-día móvil del estudiante.
 *
 * Único dueño de la tira L–V + carrusel + sincronía entre ambos. Solo existe
 * en móvil (todo el bloque vive bajo `md:hidden` en index.html); la tabla
 * semanal de escritorio y la vista admin no pasan por aquí.
 *
 * - Tira: 5 tabs (role=tab) con el día activo animado (.day-active).
 * - Carrusel: 5 páginas (section[data-day-index]) con scroll-snap nativo;
 *   cada página trae sus 13 tarjetas/hora (7:00–20:00).
 * - Sincronía tira<->carrusel solo al asentar página: evento `scrollend` con
 *   fallback debounce (~120ms) y flag isProgrammatic contra loops.
 * - Cambio de día = re-render cliente de esa página desde los docs cacheados
 *   (blockedDocs + courseDocs que calendar.js entrega en cada sync), cero
 *   re-suscripción a Firestore.
 * - Cambio de semana (solo en bordes, superando el umbral de overscroll):
 *   weekOffset±1 + aterrizaje lunes/viernes + selectedSlots=[] +
 *   refreshStudentCalendar(), con guardia isSettling anti re-suscripción
 *   múltiple. Si se suelta antes del umbral, retorno animado a la página.
 */

import { state } from '../state.js';
import { clampDayIndex, nextWeekLanding, formatDateYYYYMMDD, isPastDate } from '../utils/dates.js';
import { escapeAttr } from '../utils/escape.js';

const STRIP_ID = 'student-day-strip';
const CAROUSEL_ID = 'student-day-carousel';
const FIRST_HOUR = 7;
const LAST_HOUR = 19;
const EDGE_THRESHOLD_PX = 60;
const SETTLE_DEBOUNCE_MS = 120;

let initialized = false;
let isProgrammatic = false;
let isSettling = false;
let settleTimer = null;
let safetyTimer = null;
let touchStartX = null;
let onWeekJump = null;

// Último snapshot entregado por calendar.js: base del re-render cliente.
let lastWeekDays = null;
let lastDocs = [];
let lastClassify = null;

function els() {
  if (typeof document === 'undefined') return { strip: null, carousel: null };
  return {
    strip: document.getElementById(STRIP_ID),
    carousel: document.getElementById(CAROUSEL_ID),
  };
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Cableado único de listeners del carrusel. Idempotente.
 * @param {{ onWeekJump?: Function }} [deps]
 */
export function initStudentDayView({ onWeekJump: jump } = {}) {
  if (typeof jump === 'function') onWeekJump = jump;
  if (initialized) return;
  const { carousel } = els();
  if (!carousel) return;
  carousel.addEventListener('scroll', onScroll, { passive: true });
  // scrollend donde exista; donde no, el debounce de onScroll lo suple.
  carousel.addEventListener('scrollend', onSettled);
  carousel.addEventListener('touchstart', onTouchStart, { passive: true });
  carousel.addEventListener('touchend', onTouchEnd, { passive: true });
  initialized = true;
}

/**
 * Punto de entrada desde calendar.js: pinta tira + páginas con la semana
 * actual y los docs cacheados, y deja el carrusel en el día activo.
 * No suscribe nada a Firestore (cero re-suscripción).
 * @param {Date[]} weekDays - 5 fechas lun–vie
 * @param {Array|null} docsArray - docs mergeados (blocked+curso) o null (skeleton)
 * @param {Function} classifySlot - clasificador reutilizado de calendar.js
 */
export function syncStudentDayView(weekDays, docsArray, classifySlot) {
  const { strip, carousel } = els();
  if (!strip || !carousel || !Array.isArray(weekDays) || weekDays.length !== 5) return;
  lastWeekDays = weekDays;
  lastDocs = Array.isArray(docsArray) ? docsArray : [];
  if (typeof classifySlot === 'function') lastClassify = classifySlot;
  state.activeDayIndex = clampDayIndex(state.activeDayIndex);
  paintStrip(strip, weekDays);
  for (let i = 0; i < 5; i++) renderDayPage(carousel, i);
  scrollToPage(carousel, state.activeDayIndex, false);
}

/**
 * Selección de día desde la tira (data-action="student-day-select").
 * Actualiza el estado, la tira y desplaza el carrusel a la página.
 * @param {*} index
 * @param {{ scroll?: boolean }} [opts]
 */
export function selectStudentDay(index, { scroll = true } = {}) {
  const next = clampDayIndex(index);
  const { strip, carousel } = els();
  state.activeDayIndex = next;
  if (strip && lastWeekDays) paintStripActive(strip);
  if (carousel && lastWeekDays) {
    renderDayPage(carousel, next);
    if (scroll) scrollToPage(carousel, next, true);
  }
}

// ---- tira ----

function dayShort(d) {
  return d.toLocaleDateString('es-ES', { weekday: 'short' }).replace(/\./g, '');
}

function paintStrip(strip, weekDays) {
  const active = clampDayIndex(state.activeDayIndex);
  strip.innerHTML = weekDays.map((d, i) => {
    const on = i === active;
    return `<button type="button" role="tab" data-action="student-day-select" data-day-index="${i}"`
      + ` aria-selected="${on ? 'true' : 'false'}" tabindex="${on ? '0' : '-1'}"`
      + ` class="day-tab${on ? ' day-active' : ''}">`
      + `<span class="day-tab-name">${dayShort(d)}</span>`
      + `<span class="day-tab-num">${d.getDate()}</span></button>`;
  }).join('');
}

function paintStripActive(strip) {
  const active = clampDayIndex(state.activeDayIndex);
  strip.querySelectorAll('[data-day-index]').forEach((btn) => {
    const on = Number(btn.dataset.dayIndex) === active;
    btn.classList.toggle('day-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
    btn.setAttribute('tabindex', on ? '0' : '-1');
  });
}

// ---- páginas ----

function groupDocs(docs) {
  const groups = new Map();
  (docs || []).forEach((d) => {
    if (!d || !d.date) return;
    const k = `${d.date}_${d.hour}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  });
  return groups;
}

function cardFor(dateStr, h, arr, classify) {
  const id = `${dateStr}_${h}`;
  const past = isPastDate(dateStr, h);
  let cls = 'slot slot-free';
  let inner = '<span class="opacity-50">Disponible</span>';
  let status = 'free';
  let disabled = past;
  let docId = null;

  if (past) {
    cls = 'slot slot-past opacity-50';
    inner = '<span class="text-xs">No Disp.</span>';
    status = 'past';
  } else if (arr.length > 0 && typeof classify === 'function') {
    const result = classify(dateStr, String(h), arr, state);
    if (result.type === 'blocked') {
      cls = 'slot slot-blocked';
      inner = '<span>No disp.</span>';
      status = 'blocked';
      disabled = true;
    } else if (result.type === 'my-approved' || result.type === 'my-pending') {
      cls = `slot ${result.className}`;
      inner = `<span>${result.label}</span>`;
      status = result.type === 'my-approved' ? 'my-approved' : 'my-pending';
      docId = result.docId || null;
    } else if (result.type === 'full') {
      cls = 'slot slot-full';
      inner = '<span>Lleno</span>';
      status = 'full';
      disabled = true;
    } else if (result.type === 'partial') {
      cls = 'slot slot-partial';
      inner = `<span>Disp.</span><div class="occupancy-badge">${result.occupancy}/4</div>`;
      status = 'partial';
    }
  }

  if (!disabled && state.selectedSlots.includes(id)) {
    cls += ' slot-selected';
    inner = '<span><i class="fas fa-check mb-1"></i><br>Selecc.</span>';
  }

  const docAttr = docId ? ` data-doc-id="${escapeAttr(String(docId))}"` : '';
  return `<button type="button" id="${escapeAttr(id)}" class="${cls}" data-action="student-slot-toggle"`
    + ` data-status="${status}"${disabled ? ' disabled' : ''}${docAttr}>${inner}</button>`;
}

function ensureSection(carousel, i) {
  let sec = carousel.querySelector(`section[data-day-index="${i}"]`);
  if (!sec) {
    sec = document.createElement('section');
    sec.setAttribute('data-day-index', String(i));
    carousel.appendChild(sec);
  }
  return sec;
}

function renderDayPage(carousel, i) {
  if (!lastWeekDays) return;
  const sec = ensureSection(carousel, i);
  const d = lastWeekDays[i];
  const dateStr = formatDateYYYYMMDD(d);
  const groups = groupDocs(lastDocs);
  const cards = [];
  for (let h = FIRST_HOUR; h <= LAST_HOUR; h++) {
    const arr = groups.get(`${dateStr}_${h}`) || [];
    cards.push(`<div class="day-card">${cardFor(dateStr, h, arr, lastClassify)}`
      + `<span class="day-card-hour">${h}:00</span></div>`);
  }
  const title = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
  sec.setAttribute('aria-label', title);
  sec.innerHTML = `<h3 class="day-page-title">${title}</h3>${cards.join('')}`;
}

// ---- sincronía carrusel -> tira ----

function pageWidth(carousel) {
  return carousel.clientWidth || 1;
}

export function currentDayPage() {
  const { carousel } = els();
  if (!carousel) return clampDayIndex(state.activeDayIndex);
  return clampDayIndex(Math.round(carousel.scrollLeft / pageWidth(carousel)));
}

function scrollToPage(carousel, i, smooth) {
  const left = clampDayIndex(i) * pageWidth(carousel);
  isProgrammatic = true;
  try {
    if (typeof carousel.scrollTo === 'function') {
      carousel.scrollTo({ left, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
    } else {
      carousel.scrollLeft = left;
    }
  } catch (_) {
    try { carousel.scrollLeft = left; } catch (_) { /* noop */ }
  }
  // Red de seguridad: en entornos donde `scrollend` existe como propiedad pero
  // nunca dispara (jsdom, navegadores viejos) el flag se liberaría jamás.
  // Es idempotente: si el flag ya se consumió en onSettled, esto es no-op; y
  // un settle tardío con la página ya en su sitio tampoco sincroniza nada.
  if (safetyTimer) clearTimeout(safetyTimer);
  safetyTimer = setTimeout(() => { isProgrammatic = false; }, SETTLE_DEBOUNCE_MS + 230);
}

function onScroll() {
  if (isSettling) return;
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(onSettled, SETTLE_DEBOUNCE_MS);
}

function onSettled() {
  if (isSettling) return;
  // Scroll programático (tira o re-render): consumir sin sincronizar.
  if (isProgrammatic) {
    isProgrammatic = false;
    return;
  }
  const { strip, carousel } = els();
  if (!carousel) return;
  const page = currentDayPage();
  if (page === clampDayIndex(state.activeDayIndex)) return;
  state.activeDayIndex = page;
  renderDayPage(carousel, page);
  if (strip && lastWeekDays) paintStripActive(strip);
}

// ---- overscroll en bordes -> salto de semana ----

function onTouchStart(e) {
  const t = e.changedTouches && e.changedTouches[0];
  touchStartX = t ? t.clientX : null;
}

function onTouchEnd(e) {
  if (isSettling || touchStartX === null) return;
  const t = e.changedTouches && e.changedTouches[0];
  if (!t) return;
  const dx = t.clientX - touchStartX;
  touchStartX = null;
  const { carousel } = els();
  if (!carousel) return;
  const active = clampDayIndex(state.activeDayIndex);
  if (Math.abs(dx) < EDGE_THRESHOLD_PX) {
    // Suelta antes del umbral en un borde: retorno animado a la página.
    if (active === 0 || active === 4) scrollToPage(carousel, active, true);
    return;
  }
  if (dx < 0 && active === 4) jumpWeek(1);
  else if (dx > 0 && active === 0) jumpWeek(-1);
}

function jumpWeek(direction) {
  if (isSettling) return;
  const { weekDelta, landingIndex } = nextWeekLanding(state.activeDayIndex, direction);
  if (weekDelta === 0) return;
  isSettling = true;
  state.weekOffset += weekDelta;
  state.activeDayIndex = landingIndex;
  state.selectedSlots = [];
  try {
    if (typeof onWeekJump === 'function') onWeekJump();
  } finally {
    setTimeout(() => {
      isSettling = false;
      const { carousel } = els();
      if (carousel && lastWeekDays) scrollToPage(carousel, state.activeDayIndex, false);
    }, 350);
  }
}
