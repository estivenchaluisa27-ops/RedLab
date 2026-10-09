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
import { DEFAULTS } from '../settings/lab-config.js';

const STRIP_ID = 'student-day-strip';
const CAROUSEL_ID = 'student-day-carousel';
const FIRST_HOUR = 7;
const LAST_HOUR = 19;
const EDGE_THRESHOLD_PX = 60;
const SETTLE_DEBOUNCE_MS = 120;

let initialized = false;
let boundCarousel = null;
let isProgrammatic = false;
let isSettling = false;
let settleTimer = null;
let safetyTimer = null;
let touchStartX = null;
// Día donde EMPEZÓ el gesto actual: el salto de semana en bordes se decide
// contra este valor, no contra el día activo en vivo. Sin el ancla, un solo
// swipe que mueve de página (jue→vie por snap) leía el día ya actualizado
// en touchend y disparaba ADEMÁS el salto de semana (doble avance).
let gestureStartDay = null;
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
 * Cableado único de listeners del carrusel. Idempotente por nodo: si el
 * elemento fue reemplazado (re-render del DOM), se re-ata al nodo nuevo.
 * @param {{ onWeekJump?: Function }} [deps]
 */
export function initStudentDayView({ onWeekJump: jump } = {}) {
  if (typeof jump === 'function') onWeekJump = jump;
  if (initialized) { ensureBound(); return; }
  const { carousel } = els();
  if (!carousel) return;
  ensureBound();
  initialized = true;
}

/**
 * Ata los listeners al carrusel vivo si cambió desde el último bind.
 * Sin esto, reemplazar el nodo (p. ej. innerHTML del contenedor) dejaba
 * la vista-día sin swipe, sin tira y sin salto de semana, en silencio.
 */
function ensureBound() {
  const { carousel } = els();
  if (!carousel || carousel === boundCarousel) return;
  carousel.addEventListener('scroll', onScroll, { passive: true });
  // scrollend donde exista; donde no, el debounce de onScroll lo suple.
  carousel.addEventListener('scrollend', onSettled);
  carousel.addEventListener('touchstart', onTouchStart, { passive: true });
  carousel.addEventListener('touchend', onTouchEnd, { passive: true });
  boundCarousel = carousel;
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
  ensureBound();
  state.activeDayIndex = clampDayIndex(state.activeDayIndex);
  paintStrip(strip, weekDays);
  for (let i = 0; i < 5; i++) renderDayPage(carousel, i);
  scrollToPage(carousel, state.activeDayIndex);
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
    playPageEnter(carousel, next);
    if (scroll) scrollToPage(carousel, next);
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
  // Capacidad real de la config (la vista-día antes hardcodeaba /4 en el
  // badge y llamaba a classify sin 5.º arg: mismo default, pero sordo a
  // cambios de config en Ajustes).
  const cap = state.labConfig?.slotCapacity ?? DEFAULTS.slotCapacity;
  const past = isPastDate(dateStr, h);
  let cls = 'slot slot-free';
  let title = 'Disponible';
  let sub = `${cap} cupos libres`;
  let status = 'free';
  let disabled = past;
  let docId = null;

  if (past) {
    cls = 'slot slot-past opacity-50';
    title = 'No disponible';
    sub = 'Hora pasada';
    status = 'past';
  } else if (arr.length > 0 && typeof classify === 'function') {
    const result = classify(dateStr, String(h), arr, state, cap);
    if (result.type === 'blocked') {
      cls = 'slot slot-blocked';
      title = 'Bloqueado';
      sub = 'No reservable';
      status = 'blocked';
      disabled = true;
    } else if (result.type === 'my-approved' || result.type === 'my-pending') {
      cls = `slot ${result.className}`;
      title = result.label;
      sub = result.type === 'my-approved' ? 'Tu reserva confirmada' : 'En revisión';
      status = result.type === 'my-approved' ? 'my-approved' : 'my-pending';
      docId = result.docId || null;
    } else if (result.type === 'full') {
      cls = 'slot slot-full';
      title = 'Lleno';
      sub = `${cap}/${cap} ocupados`;
      status = 'full';
      disabled = true;
    } else if (result.type === 'partial') {
      const occ = result.occupancy ?? 0;
      const free = Math.max(cap - occ, 0);
      cls = 'slot slot-partial';
      title = `Parcial ${occ}/${cap}`;
      sub = `${free} cupo${free === 1 ? '' : 's'} libre${free === 1 ? '' : 's'}`;
      status = 'partial';
    }
  }

  if (!disabled && state.selectedSlots.includes(id)) {
    cls += ' slot-selected';
    title = 'Seleccionado';
    sub = 'Toca para quitar';
  }

  const docAttr = docId ? ` data-doc-id="${escapeAttr(String(docId))}"` : '';
  return `<button type="button" id="${escapeAttr(id)}" class="${cls}" data-action="student-slot-toggle"`
    + ` data-status="${status}"${disabled ? ' disabled' : ''}${docAttr}>`
    + `<span class="day-card-title">${title}</span><span class="day-card-sub">${sub}</span></button>`;
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

/**
 * Partes del rango del bloque en 24h (`['07:00', '08:00']`): la tarjeta
 * móvil las apila como en la referencia (inicio arriba, fin abajo).
 * Exportada para tests.
 */
export function formatHourParts(h) {
  const pad = (n) => String(n).padStart(2, '0');
  return [`${pad(h)}:00`, `${pad(h + 1)}:00`];
}

/**
 * Rango del bloque en 24h (`07:00 - 08:00`): mismo formato que la columna
 * de la tabla desktop (calendar.js). Exportada para tests.
 */
export function formatHourRange(h) {
  return formatHourParts(h).join(' - ');
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
    const [start, end] = formatHourParts(h);
    cards.push(`<div class="day-card"><span class="day-card-index">${h - FIRST_HOUR + 1}</span>`
      + `<span class="day-card-hour"><span>${start}</span><span>${end}</span></span>`
      + `${cardFor(dateStr, h, arr, lastClassify)}</div>`);
  }
  const title = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
  sec.setAttribute('aria-label', title);
  sec.innerHTML = `<h3 class="day-page-title">${title}</h3>${cards.join('')}`;
}

// ---- sincronía carrusel -> tira ----

function pageWidth(carousel) {
  return carousel.clientWidth || 1;
}

/**
 * Fundido sutil al asentar un cambio de día (tira o swipe). Solo se llama
 * desde cambios de página dirigidos, nunca desde el re-render de datos de
 * syncStudentDayView, para no re-disparar en cada snapshot de Firestore.
 */
function playPageEnter(carousel, i) {
  if (prefersReducedMotion()) return;
  const sec = carousel.querySelector(`section[data-day-index="${clampDayIndex(i)}"]`);
  if (!sec) return;
  sec.classList.remove('day-page-enter');
  void sec.offsetWidth; // reflow: permite re-disparar la animación
  sec.classList.add('day-page-enter');
}

export function currentDayPage() {
  const { carousel } = els();
  if (!carousel) return clampDayIndex(state.activeDayIndex);
  return clampDayIndex(Math.round(carousel.scrollLeft / pageWidth(carousel)));
}

function scrollToPage(carousel, i) {
  const left = clampDayIndex(i) * pageWidth(carousel);
  isProgrammatic = true;
  try {
    // Siempre instantáneo ('auto' sin scroll-behavior en CSS): un salto
    // animado emite scrolls a mitad de vuelo que onSettled leería como
    // página destino y corrompería el día activo. La fluidez la ponen el
    // snap nativo (dedo) y el fundido day-page-enter (tira).
    if (typeof carousel.scrollTo === 'function') {
      carousel.scrollTo({ left, behavior: 'auto' });
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
  playPageEnter(carousel, page);
  if (strip && lastWeekDays) paintStripActive(strip);
}

// ---- overscroll en bordes -> salto de semana ----

function onTouchStart(e) {
  const t = e.changedTouches && e.changedTouches[0];
  touchStartX = t ? t.clientX : null;
  gestureStartDay = clampDayIndex(state.activeDayIndex);
}

function onTouchEnd(e) {
  if (isSettling || touchStartX === null) { gestureStartDay = null; return; }
  const t = e.changedTouches && e.changedTouches[0];
  if (!t) { gestureStartDay = null; return; }
  const dx = t.clientX - touchStartX;
  touchStartX = null;
  const startDay = gestureStartDay ?? clampDayIndex(state.activeDayIndex);
  gestureStartDay = null;
  const { carousel } = els();
  if (!carousel) return;
  // Si el gesto ya cambió de página (el snap nativo se movió), no hay salto
  // de semana: el settle pendiente sincroniza la tira. Solo los bordes
  // quietos (empieza y termina en lun/vie) pueden saltar.
  if (currentDayPage() !== startDay) return;
  if (Math.abs(dx) < EDGE_THRESHOLD_PX) {
    // Suelta antes del umbral en un borde: retorno instantáneo a la página.
    if (startDay === 0 || startDay === 4) scrollToPage(carousel, startDay);
    return;
  }
  if (dx < 0 && startDay === 4) jumpWeek(1);
  else if (dx > 0 && startDay === 0) jumpWeek(-1);
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
      if (carousel && lastWeekDays) scrollToPage(carousel, state.activeDayIndex);
    }, 350);
  }
}
