import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountMemberGrid, getGridState } from '../../src/groups/member-grid.js';

// jsdom no implementa clipboardData en paste events por default — lo mockeamos.
function makePasteEvent(text) {
  const ev = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', {
    value: { getData: (type) => type === 'text/plain' ? text : '' },
    configurable: true
  });
  return ev;
}

describe('member-grid — init y mounting', () => {
  let container;

  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
  afterEach(() => { container?.remove(); });

  it('mountMemberGrid puebla la tabla con initial members', () => {
    const cleanup = mountMemberGrid(container, { initialMembers: [
      { cedula: '0101', nombre: 'Alice', isLeader: true },
      { cedula: '0202', nombre: 'Bob', isLeader: false }
    ] });
    const tbody = container.querySelector('[data-mg-tbody]');
    expect(tbody.children.length).toBe(2);
    expect(tbody.children[0].querySelector('[data-mg-field="cedula"]')?.hasAttribute('contenteditable')).toBe(false); // líder bloqueado
    expect(tbody.children[1].querySelector('[data-mg-field="cedula"]')?.hasAttribute('contenteditable')).toBe(true);
    cleanup();
  });

  it('getGridState devuelve members, hasDirty=false, duplicates vacío al montar', () => {
    const cleanup = mountMemberGrid(container, {
      initialMembers: [{ cedula: '01', nombre: 'X', isLeader: false }]
    });
    const st = getGridState();
    expect(st.members).toEqual([{ cedula: '01', nombre: 'X', isLeader: false }]);
    expect(st.hasDirty).toBe(false);
    expect(st.duplicates.size).toBe(0);
    cleanup();
  });

  it('lanza TypeError si container no es HTMLElement', () => {
    expect(() => mountMemberGrid(null)).toThrow(TypeError);
    expect(() => mountMemberGrid({})).toThrow(TypeError);
  });
});

describe('member-grid — paste TSV', () => {
  let container;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
  afterEach(() => { container?.remove(); });

  it('pegar TSV con cedula\tnombre genera una nueva fila por línea', () => {
    const onChange = vi.fn();
    const cleanup = mountMemberGrid(container, { initialMembers: [], onChange });
    const tbody = container.querySelector('[data-mg-tbody]');
    const tsv = '1712345678\tJuan Pérez\n1712345679\tMaría Gómez\n1712345680\tPedro López';
    tbody.dispatchEvent(makePasteEvent(tsv));

    const st = getGridState();
    expect(st.members.length).toBe(3);
    expect(st.members[0]).toEqual({ cedula: '1712345678', nombre: 'Juan Pérez', isLeader: false });
    expect(st.members[1]).toEqual({ cedula: '1712345679', nombre: 'María Gómez', isLeader: false });
    expect(st.hasDirty).toBe(true);
    cleanup();
  });

  it('ignora líneas vacías del TSV', () => {
    const cleanup = mountMemberGrid(container, { initialMembers: [] });
    const tbody = container.querySelector('[data-mg-tbody]');
    tbody.dispatchEvent(makePasteEvent('01\tA\n\n02\tB\n'));
    const st = getGridState();
    expect(st.members.length).toBe(2);
    cleanup();
  });

  it('TSV con una sola columna se descarta (requiere cedula\\tnombre)', () => {
    const cleanup = mountMemberGrid(container, { initialMembers: [] });
    const tbody = container.querySelector('[data-mg-tbody]');
    tbody.dispatchEvent(makePasteEvent('Solo Nombre'));
    const st = getGridState();
    expect(st.members.length).toBe(0);
    expect(st.hasDirty).toBe(false); // no se agregó nada
    cleanup();
  });
});

describe('member-grid — dedup', () => {
  let container;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
  afterEach(() => { container?.remove(); });

  it('marca duplicados al pegar TSV con cédulas repetidas', () => {
    const cleanup = mountMemberGrid(container, { initialMembers: [] });
    const tbody = container.querySelector('[data-mg-tbody]');
    tbody.dispatchEvent(makePasteEvent('01\tA\n02\tB\n01\tC'));
    const st = getGridState();
    expect(st.duplicates.size).toBe(1);
    expect(st.duplicates.has('01')).toBe(true);
    cleanup();
  });

  it('emite membergrid:duplicate event con lista de cédulas duplicadas', () => {
    const cleanup = mountMemberGrid(container, { initialMembers: [] });
    let dupes = null;
    container.addEventListener('membergrid:duplicate', (e) => { dupes = e.detail.cedulas; });
    const tbody = container.querySelector('[data-mg-tbody]');
    tbody.dispatchEvent(makePasteEvent('09\tA\n09\tB'));
    expect(dupes).toEqual(['09']);
    cleanup();
  });
});

describe('member-grid — dirty + saved', () => {
  let container;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
  afterEach(() => { container?.remove(); });

  it('emite membergrid:dirty al pegar', () => {
    const cleanup = mountMemberGrid(container, { initialMembers: [] });
    let dirtyEvents = 0;
    container.addEventListener('membergrid:dirty', () => { dirtyEvents++; });
    const tbody = container.querySelector('[data-mg-tbody]');
    tbody.dispatchEvent(makePasteEvent('01\tA'));
    expect(dirtyEvents).toBeGreaterThan(0);
    cleanup();
  });

  it('auto-save debounce 800ms invoca onChange con miembros limpios', async () => {
    const onChange = vi.fn();
    const cleanup = mountMemberGrid(container, { initialMembers: [], onChange });
    const tbody = container.querySelector('[data-mg-tbody]');
    tbody.dispatchEvent(makePasteEvent('01\tA'));
    expect(onChange).not.toHaveBeenCalled(); // debounce aún no cumplido
    await new Promise(f => setTimeout(f, 850));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual([{ cedula: '01', nombre: 'A', isLeader: false }]);
    cleanup();
  });

  it('botón Guardar invoca onChange inmediatamente (sin esperar debounce)', async () => {
    const onChange = vi.fn();
    const cleanup = mountMemberGrid(container, { initialMembers: [], onChange });
    const tbody = container.querySelector('[data-mg-tbody]');
    tbody.dispatchEvent(makePasteEvent('01\tA'));
    const saveBtn = container.querySelector('[data-mg-save]');
    expect(saveBtn.disabled).toBe(false); // habilitado cuando dirty
    saveBtn.click();
    // onClick async — flushSave espera onChange await
    await new Promise(f => setTimeout(f, 50));
    expect(onChange).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('emite membergrid:saved cuando onChange completa ok', async () => {
    let savedCount = null;
    const onChange = vi.fn();
    const cleanup = mountMemberGrid(container, { initialMembers: [], onChange });
    container.addEventListener('membergrid:saved', (e) => { savedCount = e.detail.count; });
    const tbody = container.querySelector('[data-mg-tbody]');
    tbody.dispatchEvent(makePasteEvent('01\tA'));
    await new Promise(f => setTimeout(f, 1000));
    expect(savedCount).toBe(1);
    cleanup();
  });
});

describe('member-grid — cleanup', () => {
  it('cleanup desmonta el grid y libera getGridState', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const cleanup = mountMemberGrid(container, { initialMembers: [{ cedula: '01', nombre: 'A', isLeader: false }] });
    expect(container.innerHTML).not.toBe('');
    cleanup();
    expect(container.innerHTML).toBe('');
    expect(getGridState()).toBe(null);
    container.remove();
  });
});
