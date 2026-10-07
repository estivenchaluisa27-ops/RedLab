/**
 * src/settings/lab-config.js — Núcleo de configuración del laboratorio (doc `config/lab`).
 *
 * P2: solo el loader con fallbacks. Los consumidores siguen usando sus
 * valores hardcodeados hasta P5; aquí no se toca ningún consumidor.
 */

export const LAB_CONFIG_PATH = 'config/lab';

export const DEFAULTS = {
  slotCapacity: 4,
  startHour: 7,
  endHour: 19,
  weekDays: [1, 2, 3, 4, 5],
  weeklyLimit: 4,
  allowedEmailDomain: 'uce.edu.ec',
};

/**
 * Mezcla la config remota sobre los defaults.
 * Solo se aplican claves conocidas y valores distintos de undefined.
 * @param {object} defaults
 * @param {unknown} remote
 * @returns {object}
 */
export function mergeLabConfig(defaults = DEFAULTS, remote) {
  const base = { ...(defaults || DEFAULTS) };
  if (!remote || typeof remote !== 'object' || Array.isArray(remote)) {
    return base;
  }
  for (const key of Object.keys(base)) {
    if (Object.prototype.hasOwnProperty.call(remote, key) && remote[key] !== undefined) {
      base[key] = remote[key];
    }
  }
  return base;
}

function isPositiveInt(n) {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

/**
 * Valida una config ya mezclada.
 * @param {object} config
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateLabConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['config inválida'] };
  }

  if (!isPositiveInt(config.slotCapacity)) {
    errors.push('slotCapacity debe ser un entero > 0');
  }

  if (!Number.isInteger(config.startHour) || !Number.isInteger(config.endHour)) {
    errors.push('startHour y endHour deben ser enteros');
  } else if (config.endHour <= config.startHour) {
    errors.push('endHour debe ser mayor que startHour');
  }

  if (
    !Array.isArray(config.weekDays) ||
    config.weekDays.length === 0 ||
    !config.weekDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  ) {
    errors.push('weekDays debe ser un arreglo no vacío de días 0-6');
  }

  if (!isPositiveInt(config.weeklyLimit)) {
    errors.push('weeklyLimit debe ser un entero > 0');
  }

  const domain = config.allowedEmailDomain;
  if (typeof domain !== 'string' || domain.trim() === '') {
    errors.push('allowedEmailDomain no puede estar vacío');
  } else {
    const formatOk = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain.trim());
    let regexOk;
    try {
      const escaped = domain.trim().replace(/\./g, '\\.');
      const re = new RegExp(`^[a-zA-Z0-9._-]+@${escaped}$`);
      regexOk = re.test(`test@${domain.trim()}`);
    } catch {
      regexOk = false;
    }
    if (!formatOk || !regexOk) {
      errors.push('allowedEmailDomain no genera una regex válida');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Lee el doc `config/lab`. Ante ausencia del doc o cualquier error
 * (sin red, sin permisos, doc inválido) devuelve una copia de DEFAULTS.
 * Nunca devuelve null: la app siempre puede pintar con defaults.
 * @param {unknown} db - Instancia de Firestore
 * @param {{ docFn?: Function, getDocFn?: Function }} deps - Fakes inyectables (tests)
 * @returns {Promise<object>}
 */
export async function loadLabConfig(db, deps = {}) {
  try {
    let docFn = deps.docFn;
    let getDocFn = deps.getDocFn;
    if (!docFn || !getDocFn) {
      const mod = await import(
        'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js'
      );
      if (!docFn) docFn = mod.doc;
      if (!getDocFn) getDocFn = mod.getDoc;
    }
    const snap = await getDocFn(docFn(db, 'config', 'lab'));
    const exists = snap && (typeof snap.exists === 'function' ? snap.exists() : snap.exists);
    if (!snap || !exists) {
      return { ...DEFAULTS };
    }
    const merged = mergeLabConfig(DEFAULTS, snap.data());
    const { valid } = validateLabConfig(merged);
    return valid ? merged : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}
