/**
 * src/settings/settings.js — Vista de Ajustes (formulario sobre config/lab)
 *
 * P5a: formulario que lee state.labConfig (cargado en boot) y persiste
 * cambios en Firestore doc `config/lab` vía setDoc.
 */
import { state } from '../state.js';
import { DEFAULTS, mergeLabConfig, validateLabConfig } from './lab-config.js';
import { showSkeleton } from '../utils/skeleton.js';
import { escapeAttr } from '../utils/escape.js';
import { alert } from '../utils/notify.js';

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Renderiza el formulario de ajustes dentro del contenedor #ajustes-form.
 * Muestra skeleton mientras "carga" (síncrono, pero mantiene el patrón visual).
 * @param {object} config - Valores a mostrar (state.labConfig o DEFAULTS)
 */
function renderForm(config) {
  const container = document.getElementById('ajustes-form');
  if (!container) return;

  const cfg = mergeLabConfig(DEFAULTS, config);

  const weekDayCheckboxes = WEEKDAY_LABELS.map((label, day) => {
    // WEEKDAY_LABELS usa índice 0=Lun…6=Dom, pero weekDays usa semántica
    // getDay (0=Dom…6=Sáb): mapear al pintar para que value/checked ya
    // sean getDay y persistan sin conversión.
    const v = (day + 1) % 7;
    const checked = cfg.weekDays.includes(v) ? 'checked' : '';
    return `
      <label class="inline-flex items-center gap-1.5 text-sm">
        <input type="checkbox" name="weekDays" value="${v}" ${checked} class="rounded">
        ${label}
      </label>`;
  }).join('');

  container.innerHTML = `
    <form data-action="save-lab-config" class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Capacidad por Slot</label>
          <input type="number" name="slotCapacity" value="${cfg.slotCapacity}" min="1" step="1" required
                 class="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-uce-500 outline-none text-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Límite Semanal (horas)</label>
          <input type="number" name="weeklyLimit" value="${cfg.weeklyLimit}" min="1" step="1" required
                 class="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-uce-500 outline-none text-sm">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Hora Inicio</label>
          <input type="number" name="startHour" value="${cfg.startHour}" min="0" max="23" step="1" required
                 class="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-uce-500 outline-none text-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Hora Fin</label>
          <input type="number" name="endHour" value="${cfg.endHour}" min="0" max="23" step="1" required
                 class="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-uce-500 outline-none text-sm">
        </div>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Días de la Semana</label>
        <div class="flex flex-wrap gap-3">
          ${weekDayCheckboxes}
        </div>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Dominio de Email Permitido</label>
        <input type="text" name="allowedEmailDomain" value="${escapeAttr(cfg.allowedEmailDomain)}" readonly
               class="w-full p-2 border border-slate-200 rounded bg-slate-50 text-slate-500 text-sm cursor-not-allowed"
               title="El dominio no se puede editar en v1">
      </div>
      <div class="flex justify-end pt-3 mt-4 border-t border-slate-100">
        <button type="submit" class="btn-navy">
          Guardar
        </button>
      </div>
    </form>
  `;
}

/**
 * Setup de la vista de Ajustes. Muestra skeleton y luego el form con valores
 * de state.labConfig (o DEFAULTS si aún no se ha cargado).
 */
export function setupAjustesView() {
  const container = document.getElementById('ajustes-form');
  if (!container) return;

  showSkeleton(container, { variant: 'block', count: 1 });

  // Render inmediato (síncrono) — el skeleton es cosmético para mantener
  // el patrón visual de carga.
  const config = state.labConfig || DEFAULTS;
  renderForm(config);
}

/**
 * Handler para guardar la config del laboratorio.
 * Valida, persiste en Firestore y actualiza state.labConfig.
 * @param {Event} e - Evento submit del form
 * @param {object} db - Instancia de Firestore
 */
export async function saveLabConfig(e, db) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);

  const weekDays = fd.getAll('weekDays').map(Number).sort((a, b) => a - b);

  const raw = {
    slotCapacity: Number(fd.get('slotCapacity')),
    startHour: Number(fd.get('startHour')),
    endHour: Number(fd.get('endHour')),
    weekDays,
    weeklyLimit: Number(fd.get('weeklyLimit')),
    allowedEmailDomain: fd.get('allowedEmailDomain')?.trim() || DEFAULTS.allowedEmailDomain,
  };

  const merged = mergeLabConfig(DEFAULTS, raw);
  const { valid, errors } = validateLabConfig(merged);

  if (!valid) {
    alert('Errores de validación:\n' + errors.join('\n'));
    return;
  }

  try {
    const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    await setDoc(doc(db, 'config', 'lab'), merged);
    state.labConfig = merged;
    alert('Configuración guardada correctamente.');
  } catch (err) {
    console.error('[ajustes] setDoc fallo:', err);
    alert('Error al guardar la configuración.');
  }
}
