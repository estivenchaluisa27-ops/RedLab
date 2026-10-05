/**
 * src/utils/cover-pattern.js - Portadas geometricas decorativas para tarjetas
 *
 * Genera un patron SVG determinista a partir de un texto semilla (el id del
 * curso) y lo devuelve como data URI listo para `background-image`.
 *
 * Decisiones y por que:
 *
 * - SIN DEPENDENCIAS NI RED. No se usa Trianglify ni ninguna API: la app tiene
 *   que funcionar sin internet, y una importacion remota en modo offline tumba
 *   el modulo que importa (courses-list) y con el la seccion de cursos. Un
 *   generador de ~30 lineas cubre exactamente el besoin sin anadir superficie.
 *
 * - DETERMINISTA. La misma semilla produce SIEMPRE el mismo patron. Sin esto,
 *   cada onSnapshot reordenando cursos cambiaria las portadas y la pantalla
 *   "saltaria" al abrirla. Se apoya en un PRNG con semilla (mulberry32), no en
 *   Math.random, que no admite semilla.
 *
 * - PALETA DE MARCA, no arcoiris. Los colores salen de los mismos tonos que el
 *   resto de la app (#004274, #003366, #002244 y el oro #e1ad01 / #d1b610) para
 *   que las tarjetas no compitan con el header ni parezcan otro producto.
 *
 * - DECORATIVO. El patron no codifica ningun dato del curso: no representa
 *   estado ni capacidad. Si alguna vez lo hiciera, el hash por id dejaria de
 *   bastar y habria que sembrar con el estado.
 */

const W = 400;
const H = 110;

/** Paletas derivadas de la identidad visual de RedLab (tailwind-input.css). */
const PALETTES = [
  { bg: '#004274', fg: '#0d6ea8', accent: '#e1ad01' },
  { bg: '#003366', fg: '#1f6fb2', accent: '#d1b610' },
  { bg: '#002244', fg: '#0b5c8a', accent: '#f0c419' },
  { bg: '#003f6b', fg: '#4a90c2', accent: '#e1ad01' },
  { bg: '#004b7a', fg: '#2d8ac4', accent: '#d9b310' },
];

/**
 * FNV-1a de 32 bits seguido del finalizador fmix32 de MurmurHash3.
 *
 * El fmix32 no es cosmetico: sin el, FNV-1a reparte mal las claves que solo
 * difieren en los ultimos caracteres (curso-0, curso-1, ...), que es
 * precisamente como se ven dos ids consecutivos. Medido: 200 claves
 * consecutivas caian en solo 10 de 16 cubos del rango. Con el finalizador la
 * dispersion es completa. Lo detecto el test de dispersion, no la inspeccion.
 */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** PRNG con semilla. Math.random() no sirve aqui porque no se puede sembrar. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const opacity = (rnd, min, max) => (min + rnd() * (max - min)).toFixed(2);

function triangles(rnd, colors) {
  const cell = 34;
  let out = '';
  for (let y = -cell; y < H + cell; y += cell) {
    for (let x = -cell; x < W + cell; x += cell) {
      const skew = Math.round(cell * (0.3 + rnd() * 0.4));
      out += `<polygon points="${x},${y} ${x + cell},${y} ${x + skew},${y + cell}" `
        + `fill="${pick(rnd, colors)}" opacity="${opacity(rnd, 0.1, 0.45)}"/>`;
    }
  }
  return out;
}

function squares(rnd, colors) {
  const cell = 40;
  let out = '';
  for (let y = 0; y < H + cell; y += cell) {
    for (let x = 0; x < W + cell; x += cell) {
      out += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" `
        + `fill="${pick(rnd, colors)}" opacity="${opacity(rnd, 0.08, 0.38)}"/>`;
    }
  }
  return out;
}

function hexagons(rnd, colors) {
  const r = 26;
  const dx = r * 1.5;
  const dy = r * Math.sqrt(3);
  let out = '';
  for (let row = -1; row * dy < H + dy; row += 1) {
    for (let col = -1; col * dx < W + dx; col += 1) {
      const cx = col * dx;
      const cy = row * dy + (col % 2 ? dy / 2 : 0);
      const pts = [];
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI / 3) * i;
        pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
      }
      out += `<polygon points="${pts.join(' ')}" fill="${pick(rnd, colors)}" `
        + `opacity="${opacity(rnd, 0.1, 0.42)}"/>`;
    }
  }
  return out;
}

function circles(rnd, colors) {
  let out = '';
  for (let i = 0; i < 26; i += 1) {
    const r = (6 + rnd() * 22).toFixed(1);
    out += `<circle cx="${(rnd() * W).toFixed(1)}" cy="${(rnd() * H).toFixed(1)}" r="${r}" `
      + `fill="${pick(rnd, colors)}" opacity="${opacity(rnd, 0.08, 0.4)}"/>`;
  }
  return out;
}

function dots(rnd, colors) {
  const cell = 16;
  let out = '';
  for (let y = 0; y < H + cell; y += cell) {
    for (let x = 0; x < W + cell; x += cell) {
      out += `<circle cx="${x}" cy="${y}" r="${(1.5 + rnd() * 4.5).toFixed(1)}" `
        + `fill="${pick(rnd, colors)}" opacity="${opacity(rnd, 0.15, 0.55)}"/>`;
    }
  }
  return out;
}

/** Cinco familias de figuras: cubren el aspecto de la referencia sin repetirse. */
const FAMILIES = [triangles, squares, hexagons, circles, dots];

/**
 * Escapa un SVG para usarlo dentro de url("data:image/svg+xml,...").
 * El `#` de los colores tiene que ir SIEMPRE en %23: si se deja literal, el
 * data URI se trunca en el primer color y la portada sale vacia. encodeURIComponent
 * ya lo cubre, pero se restauran los parentesis porque #003366 forma parte del
 * path en algunos navegadores y sin escapar rompe la URL.
 */
function encodeSvg(svg) {
  return encodeURIComponent(svg).replace(/'/g, '%27');
}

/**
 * Devuelve la portada como valor de CSS para `background-image`.
 *
 * ENVUELTO EN COMILLAS SIMPLES A PROPOSITO. El valor se inyecta dentro de un
 * atributo HTML con comillas dobles (`style="background-image:..."`), asi que un
 * envoltorio de comillas dobles cerraria el atributo antes de tiempo: el
 * navegador se queda con `background-image:url("` y la portada sale vacia.
 * Medido, no supuesto. Como encodeSvg ya convierte ' en %27, no hay apostrophes
 * dentro del payload que puedan cerrar este envoltorio.
 *
 * @param {string} seed texto que identifica el curso (normalmente su id)
 * @returns {string} url('data:image/svg+xml,...')
 */
export function coverPattern(seed) {
  const text = String(seed ?? '');
  const h = hash(text);
  const rnd = mulberry32(h);
  const palette = PALETTES[h % PALETTES.length];
  const family = FAMILIES[Math.floor(rnd() * FAMILIES.length)];
  const colors = [palette.fg, palette.accent, palette.fg];
  const body = family(rnd, colors);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"`
    + ` viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${palette.bg}"/>${body}</svg>`;
  return `url('data:image/svg+xml,${encodeSvg(svg)}')`;
}

/** Solo para tests: expone el hash para poder verificar dispersion. */
export function coverSeedOf(seed) {
  return hash(String(seed ?? ''));
}