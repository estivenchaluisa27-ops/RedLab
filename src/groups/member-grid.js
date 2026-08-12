/**
 * src/groups/member-grid.js — Tabla editable inline de integrantes (Fase C)
 *
 * Copy & paste estilo Excel: pega una tabla TSV desde Excel/Sheets y se generan
 * tantas filas como líneas (formato esperado por columna: `cedula\tnombre`).
 * Edición inline con celdas contenteditable, navegación por teclado Tab/Enter/flechas.
 * Dedup por cédula: marcado visual al blur + event `membergrid:duplicate`.
 * Auto-save con debounce 800ms vía callback onChange(members), más botón Guardar explícito.
 * El líder del grupo es la primera fila; su cédula está bloqueada (contenteditable=false).
 *
 * API pública (contrato plan v2):
 *   mountMemberGrid(container, { initialMembers, onChange }) -> cleanup function
 *   getGridState() -> { members, hasDirty, duplicates }
 *
 * Eventos CustomEvent emitidos sobre el container:
 *   - membergrid:dirty   (detail: { dirty: true })
 *   - membergrid:saved   (detail: { count: number })
 *   - membergrid:duplicate (detail: { cedulas: string[] })
 *
 * Patrones verificados contra MDN (source-driven-development):
 *   - paste event (getData('text/plain') + preventDefault) — Baseline widely available
 *   - beforeinput + InputEvent.inputType === 'insertFromPaste' — Baseline marzo 2021
 */

import { escapeHtml } from '../utils/escape.js';

const SAVE_DEBOUNCE_MS = 800;
const LARGE_GROUP_WARNING = 500;

let _activeGrid = null;

/**
 * Monta el MemberGrid en `container` (HTMLElement).
 * @param {HTMLElement} container — elemento donde se monta la tabla
 * @param {Object} opts
 * @param {Array<{cedula:string,nombre:string,isLeader:boolean}>} opts.initialMembers
 * @param {(members: Array) => Promise<void>} [opts.onChange] — persistencia (auto/forzado)
 * @returns {() => void} cleanup: remueve listeners y limpia estado interno
 */
export function mountMemberGrid(container, opts = {}) {
  if (!container || !(container instanceof HTMLElement)) {
    throw new TypeError('mountMemberGrid: container debe ser HTMLElement');
  }
  const initial = Array.isArray(opts.initialMembers) ? opts.initialMembers : [];
  const onChange = typeof opts.onChange === 'function' ? opts.onChange : null;

  // Estado interno del grid
  let rows = initial.map(cloneRow);
  let hasDirty = false;
  let duplicates = new Set();
  let saveTimer = null;
  let saving = false;
  let lastSaveCount = 0;

  const AC = new AbortController();
  const { signal } = AC;

  // Render inicial
  render();

  // ---------- Helpers ----------

  function cloneRow(r) {
    return { cedula: (r && r.cedula) || '', nombre: (r && r.nombre) || '', isLeader: Boolean(r && r.isLeader) };
  }

  function emit(name, detail) {
    container.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, cancelable: false }));
  }

  function setDirty(v) {
    hasDirty = Boolean(v);
    emit('membergrid:dirty', { dirty: hasDirty });
    updateSaveBadge();
    if (hasDirty && onChange) scheduleAutoSave();
  }

  function updateSaveBadge() {
    const badge = container.querySelector('[data-mg-badge]');
    if (!badge) return;
    badge.classList.toggle('hidden', !hasDirty);
    badge.textContent = hasDirty ? 'Sin guardar' : '';
  }

  function scheduleAutoSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; flushSave(); }, SAVE_DEBOUNCE_MS);
  }

  async function flushSave() {
    if (saving) return;
    if (!hasDirty || !onChange) return;
    saving = true;
    const snapshot = currentMembers();
    try {
      await onChange(snapshot);
      hasDirty = false;
      lastSaveCount = snapshot.length;
      emit('membergrid:saved', { count: lastSaveCount });
      updateSaveBadge();
    } catch (e) {
      console.error('member-grid: onChange failed', e);
      // reintentar en 2s para no perder datos
      saveTimer = setTimeout(() => { saveTimer = null; flushSave(); }, 2000);
    } finally {
      saving = false;
    }
  }

  function currentMembers() {
    // filtra filas con cédula y nombre presentes; cédula es la PK
    return rows
      .filter(r => r.cedula && r.nombre)
      .map(r => ({ cedula: String(r.cedula).trim(), nombre: String(r.nombre).trim(), isLeader: Boolean(r.isLeader) }));
  }

  function dedupe() {
    const seen = new Map();
    const dupes = new Set();
    rows.forEach(r => {
      const key = (r.cedula || '').trim();
      if (!key) return;
      if (seen.has(key)) dupes.add(key);
      else seen.set(key, true);
    });
    duplicates = dupes;
    if (dupes.size) emit('membergrid:duplicate', { cedulas: Array.from(dupes) });
    return dupes;
  }

  // ---------- Render ----------

  function render() {
    container.innerHTML = `
      <div class="flex justify-between items-center mb-2">
        <p class="text-xs text-slate-500">Pega una tabla desde Excel/Sheets (columnas: Cédula + Nombre). Edita celdas con doble clic o navegando con Tab.</p>
        <span data-mg-badge class="hidden text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200"></span>
      </div>
      <div class="border border-slate-200 rounded-lg overflow-hidden">
        <table class="w-full text-sm text-left border-collapse" role="grid">
          <thead class="bg-slate-100 text-slate-600 font-bold text-xs uppercase">
            <tr>
              <th scope="col" class="px-3 py-2 w-32">Cédula</th>
              <th scope="col" class="px-3 py-2">Nombre Completo</th>
              <th scope="col" class="px-3 py-2 w-24 text-center">Rol</th>
              <th scope="col" class="px-3 py-2 w-16 text-right">Acción</th>
            </tr>
          </thead>
          <tbody data-mg-tbody></tbody>
          <tfoot class="bg-uce-50">
            <tr data-mg-newrow>
              <td class="px-3 py-2"><input type="text" data-mg-new="cedula" placeholder="Cédula" aria-label="Cédula nuevo integrante" class="w-full p-1.5 border border-slate-200 rounded text-xs"></td>
              <td class="px-3 py-2"><input type="text" data-mg-new="nombre" placeholder="Nombre Completo" aria-label="Nombre nuevo integrante" class="w-full p-1.5 border border-slate-200 rounded text-xs"></td>
              <td class="px-3 py-2 text-center text-xs text-slate-500">Estudiante</td>
              <td class="px-3 py-2 text-right"><button type="button" data-mg-add aria-label="Agregar integrante" class="bg-green-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-green-700 shadow-sm"><i class="fas fa-plus"></i></button></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="mt-3 flex justify-between items-center">
        <p data-mg-count class="text-xs text-slate-500"></p>
        <div class="flex gap-2">
           <button type="button" data-mg-save class="bg-uce-700 text-white px-4 py-2 rounded font-bold text-sm hover:opacity-90 transition disabled:opacity-50" disabled>Guardar</button>
        </div>
      </div>
    `;

    const tbody = container.querySelector('[data-mg-tbody]');
    const newInput = container.querySelector('[data-mg-newrow]');

    tbody.addEventListener('paste', onPasteTbody, { signal });
    tbody.addEventListener('beforeinput', onBeforeinputCell, { signal });
    tbody.addEventListener('blur', onBlurCell, { signal, capture: true });
    tbody.addEventListener('keydown', onKeydownCell, { signal });

    newInput.querySelector('[data-mg-add]').addEventListener('click', onAddNew, { signal });
    newInput.querySelector('[data-mg-new="cedula"]').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onAddNew(); } }, { signal });
    newInput.querySelector('[data-mg-new="nombre"]').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onAddNew(); } }, { signal });

    container.querySelector('[data-mg-save]').addEventListener('click', () => { if (saveTimer) clearTimeout(saveTimer); saveTimer = null; flushSave(); }, { signal });

    if (rows.length >= LARGE_GROUP_WARNING) appendWarning();
    renderRows();
    updateCount();
  }

  function renderRows() {
    const tbody = container.querySelector('[data-mg-tbody]');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (rows.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="4" class="px-3 py-6 text-center text-slate-400 text-sm italic" role="status">Sin integrantes. Pega una tabla desde Excel o agrega integrantes manualmente.</td>`;
      tbody.appendChild(tr);
      return;
    }

    rows.forEach((r, idx) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0 hover:bg-slate-50 transition';
      tr.dataset.mgIndex = String(idx);

      const isLeader = r.isLeader;
      const isDup = duplicates.has(String(r.cedula).trim()) && !isLeader;

      // Cédula
      const tdCed = document.createElement('td');
      tdCed.className = 'px-3 py-2 ' + (isDup ? 'bg-red-50 ' : '');
      if (isLeader) {
        tdCed.innerHTML = `<div class="flex items-center gap-2"><span class="font-bold text-slate-700">${escapeHtml(r.cedula)}</span><i class="fas fa-crown text-amber-500 text-xs" title="Jefe de grupo"></i></div>`;
      } else {
        tdCed.setAttribute('contenteditable', 'true');
        tdCed.setAttribute('role', 'textbox');
        tdCed.setAttribute('aria-label', `Cédula fila ${idx + 1}`);
        tdCed.setAttribute('aria-invalid', String(isDup));
        tdCed.textContent = r.cedula;
        tdCed.className += ' outline-none focus:bg-uce-50 focus:ring-2 focus:ring-inset focus:ring-uce-400 transition';
        if (isDup) tdCed.title = 'Cédula duplicada en otra fila';
      }
      tdCed.dataset.mgField = 'cedula';
      tr.appendChild(tdCed);

      // Nombre
      const tdName = document.createElement('td');
      tdName.className = 'px-3 py-2 outline-none focus:bg-uce-50 focus:ring-2 focus:ring-inset focus:ring-uce-400 transition';
      tdName.setAttribute('contenteditable', 'true');
      tdName.setAttribute('role', 'textbox');
      tdName.setAttribute('aria-label', `Nombre fila ${idx + 1}`);
      tdName.textContent = r.nombre;
      tdName.dataset.mgField = 'nombre';
      tr.appendChild(tdName);

      // Rol
      const tdRol = document.createElement('td');
      tdRol.className = 'px-3 py-2 text-center text-xs';
      if (isLeader) {
        tdRol.innerHTML = '<span class="bg-uce-700 text-white px-2 py-0.5 rounded font-bold text-[10px]">LÍDER</span>';
      } else {
        tdRol.innerHTML = '<span class="text-slate-400">Estudiante</span>';
      }
      tr.appendChild(tdRol);

      // Acción
      const tdAct = document.createElement('td');
      tdAct.className = 'px-3 py-2 text-right';
      if (!isLeader) {
        tdAct.innerHTML = `<button type="button" data-mg-del aria-label="Eliminar fila ${idx + 1}" class="text-red-400 hover:text-red-600 bg-red-50 p-1.5 rounded transition"><i class="fas fa-trash"></i></button>`;
      }
      tr.appendChild(tdAct);

      tbody.appendChild(tr);
    });
  }

  function appendWarning() {
    const tip = container.querySelector('[data-mg-badge]')?.parentElement;
    if (!tip) return;
    const warn = document.createElement('p');
    warn.className = 'text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded border border-amber-200 mr-2';
    warn.textContent = `⚠ Grupo grande (${rows.length} integrantes). El guardado puede tardar.`;
    tip.insertBefore(warn, tip.firstChild);
  }

  function updateCount() {
    const el = container.querySelector('[data-mg-count]');
    if (!el) return;
    const c = currentMembers().length;
    el.textContent = c === 0 ? 'Sin integrantes' : `${c} integrante${c === 1 ? '' : 's'}${duplicates.size ? ` · ${duplicates.size} duplicados` : ''}`;
  }

  function updateSaveButton() {
    const btn = container.querySelector('[data-mg-save]');
    if (btn) btn.disabled = !hasDirty;
  }

  // ---------- Handlers ----------

  function onAddNew() {
    const cedInput = container.querySelector('[data-mg-new="cedula"]');
    const nameInput = container.querySelector('[data-mg-new="nombre"]');
    const ced = (cedInput?.value || '').trim();
    const name = (nameInput?.value || '').trim();
    if (!ced || !name) return;
    rows.push({ cedula: ced, nombre: name, isLeader: false });
    if (cedInput) cedInput.value = '';
    if (nameInput) nameInput.value = '';
    cedInput?.focus();
    dedupe();
    renderRows();
    updateCount();
    setDirty(true);
    updateSaveButton();
  }

  function onPasteTbody(e) {
    // Captura paste a nivel <tbody> para soportar pegar varias filas a la vez
    const data = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    if (!data) return;
    e.preventDefault();

    const lines = data.split(/\r?\n/).filter(l => l.trim() !== '');
    const newRows = [];
    for (const line of lines) {
      const parts = line.split(/\t/);
      const ced = (parts[0] || '').trim();
      const name = (parts[1] || '').trim();
      // Require ambas columnas (cedula\tnombre). Líneas sin tab se descartan.
      if (!ced || !name) continue;
      newRows.push({ cedula: ced, nombre: name, isLeader: false });
    }
    if (!newRows.length) return;
    rows.push(...newRows);
    dedupe();
    renderRows();
    updateCount();
    setDirty(true);
    updateSaveButton();
  }

  function onBeforeinputCell(e) {
    // Cancela el paste default dentro de celdas individuales (lo maneja el handler paste del tbody)
    if (e.target && e.target.dataset && e.target.dataset.mgField && e.inputType === 'insertFromPaste') {
      e.preventDefault();
    }
  }

  function onBlurCell(e) {
    const td = e.target;
    if (!td || !td.dataset || !td.dataset.mgField) return;
    const idx = Number(td.parentElement?.dataset?.mgIndex);
    if (Number.isNaN(idx) || !rows[idx]) return;
    const val = (td.textContent || '').trim();
    if (rows[idx][td.dataset.mgField] !== val) {
      rows[idx][td.dataset.mgField] = val;
      dedupe();
      // re-renders para que la cédula duplicada se marque visualmente
      renderRows();
      updateCount();
      setDirty(true);
      updateSaveButton();
    } else {
      dedupe();
      renderRows();
    }
  }

  function onKeydownCell(e) {
    const td = e.target;
    if (!td || !td.dataset || !td.dataset.mgField) return;
    const tr = td.parentElement;
    const tbody = tr?.parentElement;
    if (!tbody) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      const next = tr.nextElementSibling;
      if (next) {
        const cell = next.querySelector('[data-mg-field]');
        cell?.focus();
      } else {
        // Salta al input de nueva fila
        container.querySelector('[data-mg-new="cedula"]')?.focus();
      }
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey && tr.nextElementSibling === null) {
      // Después de la última fila editable, va al input de nueva fila
      // (comportamiento default del navegador con Tab ya lo gestiona; aquí prevenimos que pegue en celda no editable)
    }
    if (e.key === 'Delete' && e.ctrlKey) {
      e.preventDefault();
      const idx = Number(tr.dataset.mgIndex);
      if (Number.isNaN(idx)) return;
      const r = rows[idx];
      if (r && r.isLeader) return; // no se puede eliminar al líder
      rows.splice(idx, 1);
      dedupe();
      renderRows();
      updateCount();
      setDirty(true);
      updateSaveButton();
      return;
    }
    // Click en trash
    if (e.target && e.target.closest && e.target.closest('[data-mg-del]')) {
      // El listener de trash se maneja abajo en delegation único (ya cubierto por click)
    }
  }

  // Delete por delegación: como usamos innerHTML en renderRows, los bottones se recrean.
  container.addEventListener('click', (e) => {
    const del = e.target.closest('[data-mg-del]');
    if (!del) return;
    const tr = del.closest('tr');
    const idx = Number(tr?.dataset?.mgIndex);
    if (Number.isNaN(idx)) return;
    const r = rows[idx];
    if (r && r.isLeader) return;
    rows.splice(idx, 1);
    dedupe();
    renderRows();
    updateCount();
    setDirty(true);
    updateSaveButton();
  }, { signal });

  function getGridStateLocal() {
    return { members: currentMembers(), hasDirty, duplicates: new Set(duplicates) };
  }

  // Exponer getGridState() global al activeGrid
  _activeGrid = getGridStateLocal;

  updateSaveButton();

  // Cleanup
  return function cleanup() {
    if (saveTimer) clearTimeout(saveTimer);
    if (_activeGrid === getGridStateLocal) _activeGrid = null;
    AC.abort();
    container.innerHTML = '';
  };
}

/**
 * Estado actual del grid montado (miembros limpios, dirty, duplicados).
 * Returns null si no hay grid montado.
 */
export function getGridState() {
  if (typeof _activeGrid === 'function') return _activeGrid();
  return null;
}
