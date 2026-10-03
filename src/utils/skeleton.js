/**
 * src/utils/skeleton.js — Skeletons de carga reutilizables
 *
 * Los contenedores que se llenan desde Firestore arrancan vacios hasta el primer
 * onSnapshot. Con red lenta (o abriendo la app sin conexion) eso se ve como un
 * hueco en blanco y despues el contenido salta de golpe.
 *
 * Estos helpers pintan la silueta de la forma final: el usuario ve la estructura
 * desde el inicio y el layout deja de moverse cuando llegan los datos.
 *
 * Regla de integracion: el codigo que ya renderiza datos hace
 * `container.innerHTML = ...`, asi que el skeleton se reemplaza solo. Solo hay
 * que pintar el skeleton ANTES de arrancar la carga.
 */

const BAR = 'bg-slate-200 dark:bg-slate-700';
const BAR_SOFT = 'bg-slate-100 dark:bg-slate-800';

/**
 * Una barra skeletica con shimmer.
 * @param {string} [extra] clases extra (ancho, alto, radio)
 * @returns {string}
 */
export function bar(extra = '') {
  return `<div class="${BAR} rounded animate-pulse ${extra}"></div>`;
}

/**
 * Bloque rectangular skeleton (avatar, thumbnail, celda).
 * @param {string} [extra]
 * @returns {string}
 */
export function block(extra = '') {
  return `<div class="${BAR_SOFT} rounded-lg animate-pulse ${extra}"></div>`;
}

/**
 * Linea de texto skeleton de ancho variable, para que la silueta no sea
 * un bloque uniforme (se lee mas como contenido real).
 * @param {string} widthClass clase de ancho, p.ej. 'w-3/4'
 * @returns {string}
 */
export function line(widthClass = 'w-full') {
  return `<div class="${BAR} h-3 rounded animate-pulse ${widthClass}"></div>`;
}

/**
 * Skeleton de una tarjeta: encabezado + lineas + boton.
 * @returns {string}
 */
export function card() {
  return `
    <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-card space-y-3">
      <div class="flex items-center gap-3">
        ${block('h-10 w-10 shrink-0')}
        <div class="flex-1 space-y-2">
          ${line('w-2/5')}
          ${bar('h-3 w-1/4')}
        </div>
      </div>
      <div class="space-y-2 pt-1">
        ${line('w-full')}
        ${line('w-5/6')}
      </div>
      <div class="pt-2">
        ${bar('h-8 w-28 rounded-md')}
      </div>
    </div>
  `;
}

/**
 * Skeleton de una fila (lista de notifiedades, integrantes, reportes).
 * @returns {string}
 */
export function row() {
  return `
    <div class="rounded-lg border border-slate-200 bg-white p-4 flex items-center gap-3">
      ${block('h-9 w-9 shrink-0 rounded-full')}
      <div class="flex-1 space-y-2">
        ${line('w-1/3')}
        ${bar('h-3 w-2/3')}
      </div>
    </div>
  `;
}

/**
 * Pinta skeletons en un contenedor. No hace nada si ya hay skeleton, para
 * que varias llamadas durante la misma carga no se acumulen.
 * @param {HTMLElement|null} container
 * @param {{variant?: 'card'|'row', count?: number, className?: string}} [opts]
 */
export function showSkeleton(container, opts = {}) {
  if (!container) return;
  const { variant = 'card', count = 6, className = '' } = opts;
  if (container.dataset.skeleton === '1') return;

  const item = variant === 'row' ? row() : card();
  container.innerHTML = Array.from({ length: count }, () => item).join('');
  container.dataset.skeleton = '1';
  if (className) container.classList.add(...className.split(' ').filter(Boolean));
}

/**
 * Quita el estado de skeleton. Opcional: normalmente no hace falta, porque el
 * render real sobrescribe innerHTML; se usa cuando se cambia solo el dataset.
 * @param {HTMLElement|null} container
 */
export function clearSkeleton(container) {
  if (container) delete container.dataset.skeleton;
}

/**
 * Skeleton de pantalla completa para el arranque, antes de saber si el usuario
 * es admin o estudiante. Se muestra siempre al cargar y lo oculta showView().
 * @param {string} label texto de contexto, p.ej. "Cargando tus clases"
 * @returns {string}
 */
export function bootScreen(label = 'Cargando') {
  return `
    <div class="min-h-screen bg-uce-950 flex flex-col items-center justify-center px-6 gap-6">
      <div class="flex items-center gap-3">
        <div class="relative">
          ${block('h-12 w-12 rounded-xl')}
          <div class="absolute inset-0 rounded-xl ring-1 ring-uce-500/30"></div>
        </div>
        <div class="space-y-2">
          ${bar('h-4 w-24')}
          ${bar('h-3 w-16')}
        </div>
      </div>
      <div class="w-40 h-1 rounded-full bg-uce-900 overflow-hidden">
        <div class="h-full w-1/3 rounded-full bg-uce-400 animate-pulse"></div>
      </div>
      <p class="text-uce-200/70 text-sm">${label}…</p>
    </div>
  `;
}