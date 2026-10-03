/**
 * src/utils/skeleton.js — Siluetas de carga
 *
 * Renderiza esqueletos con boneyard-js (`renderBones`), que devuelve un string
 * HTML de rectangulos posicionados en absoluto y con la animacion de pulso.
 *
 * El bundle esta VENDORIZADO en src/vendor/boneyard.js a proposito, no se
 * importa del CDN: la app funciona sin internet y una importacion remota
 * resolveria contra un origen inalcanzable en modo offline, tumbao el modulo
 * que importa (courses-list, group-details, history, reports) y con el la app.
 * Ademas npm install boneyard-js arrastra Playwright como dependencia dura,
 * que aqui no se usa: el runtime de boneyard es JS puro.
 *
 * Los bones se escriben a mano (formato compacto [x, y, w, h, r]) en vez de
 * extraerse con la CLI de Playwright. Motivo: la CLI necesita la app servida y
 * con sesion iniciada, y RedLab esta tras Firebase Auth. Aqui el layout de cada
 * contenedor es fijo y conocido, asi que se declara directamente.
 *
 * Convensiones del formato compacto:
 *   x, w  -> porcentaje del ancho del contenedor
 *   y, h  -> pixeles
 *   r     -> radio en px, o '50%' para circulos
 *   6to elemento (c: true) = hueso contenedor; renderBones lo OMITE, asi que
 *   aqui no se usa.
 */
import { renderBones } from '../vendor/boneyard.js';

// slate-200: encaja con la paleta Tailwind que ya usa la app.
const BONE_COLOR = '#e2e8f0';

// Alto de cada variante en px. Es el `height` del contenedor posicionado, asi
// que hay que ajustarlo si se tocan los bones.
const VARIANTS = {
  card: { height: 132, gap: 0 },
  row: { height: 64, gap: 8 },
  line: { height: 44, gap: 0 },
  block: { height: 64, gap: 0 },
  bar: { height: 12, gap: 0 },
};

/**
 * Construye los bones de una variante.
 * @param {keyof VARIANTS} variant
 * @param {number} containerWidth ancho real del contenedor, en px. Necesario
 *   para que los circulos salgan redondos: renderBones compara el ancho en px
 *   (w% * width) contra la altura, y si no coinciden el circulo se deforma.
 * @returns {Array<[number, number, number, number, number|string]>}
 */
function bonesFor(variant, containerWidth) {
  const pct = (px) => (containerWidth > 0 ? (px / containerWidth) * 100 : 0);

  switch (variant) {
    // Tarjeta de curso: titulo, dos lineas de detalle y un chip al pie.
    case 'card':
      return [
        [6, 20, 58, 16, 4],
        [6, 46, 84, 11, 3],
        [6, 64, 66, 11, 3],
        [6, 94, 34, 18, 9],
      ];

    // Fila de lista: circulo a la izquierda y dos lineas de texto.
    case 'row':
      return [
        [pct(16), 14, pct(36), 36, '50%'],
        [pct(64), 18, 45, 12, 4],
        [pct(64), 38, 70, 10, 3],
      ];

    // Parrafo de texto.
    case 'line':
      return [
        [0, 0, 100, 12, 3],
        [0, 20, 78, 12, 3],
      ];

    case 'block':
      return [[0, 0, 100, 64, 4]];

    case 'bar':
      return [[0, 0, 60, 12, 4]];

    default:
      return [[0, 0, 100, 48, 4]];
  }
}

/**
 * Devuelve el HTML de una unidad de esqueleto.
 * @param {keyof VARIANTS} variant
 * @param {number} containerWidth
 * @returns {string}
 */
export function unit(variant, containerWidth) {
  const cfg = VARIANTS[variant] ?? VARIANTS.block;
  return renderBones(
    { bones: bonesFor(variant, containerWidth), width: containerWidth, height: cfg.height },
    BONE_COLOR,
    true
  );
}

/**
 * HTML de una sola fila de esqueleto.
 *
 * Existe suelto porque reports.js lo concatena con `innerHTML +=` DESPUES del
 * checkbox "Seleccionar todos", para no borrarlo. showSkeleton() no sirve
 * ahi porque reemplaza el contenido entero del contenedor.
 *
 * @param {number} [containerWidth] ancho del contenedor; si se omite se mide
 * @returns {string}
 */
export function row(containerWidth) {
  const w = containerWidth || 320;
  return `<div style="margin-bottom:8px">${unit('row', w)}</div>`;
}

/**
 * Pinta esqueletos en un contenedor mientras llegan sus datos.
 *
 * El render real sobrescribe el innerHTML, asi que no hace falta quitar nada a
 * mano. Si el contenedor llega a estar vacio y visible, no se pinta nada.
 *
 * @param {HTMLElement|null} container
 * @param {{variant?: keyof VARIANTS, count?: number}} [options]
 */
export function showSkeleton(container, options = {}) {
  if (!container) return;
  const { variant = 'row', count = 5 } = options;
  const cfg = VARIANTS[variant] ?? VARIANTS.block;

  // Sin layout hay 0px de ancho y los circulos salen deformados. Se usa un
  // ancho de reserva antes de que el navegador layouthee.
  const containerWidth = container.clientWidth || container.offsetWidth || 320;
  const total = Math.max(1, Math.min(count, 12));

  const html = Array.from({ length: total }, (_, i) => {
    const spacing = cfg.gap && i < total - 1 ? `margin-bottom:${cfg.gap}px` : '';
    // min-width:0 evita que un hijo con ancho intrinseco ensanche la celda de
    // un grid y desborde el contenedor.
    return `<div style="${spacing};min-width:0">${unit(variant, containerWidth)}</div>`;
  }).join('');

  container.innerHTML = html;
}

/** @deprecated usa showSkeleton() */
export function card() { return unit('card', 320); }
/** @deprecated usa showSkeleton() */
export function block() { return unit('block', 320); }
/** @deprecated usa showSkeleton() */
export function bar() { return unit('bar', 320); }
/** @deprecated usa showSkeleton() */
export function line() { return unit('line', 320); }