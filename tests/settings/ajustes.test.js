import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de Firebase Firestore
const mockSetDoc = vi.fn(() => Promise.resolve());
const mockDoc = vi.fn((db, ...path) => ({ db, path }));

vi.mock('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js', () => ({
  doc: mockDoc,
  setDoc: mockSetDoc,
}));

// Mock de state.js
const mockState = { labConfig: null };
vi.mock('../../src/state.js', () => ({
  get state() { return mockState; },
  resetState: vi.fn(),
  clearListeners: vi.fn(),
}));

// Mock de notify.js
vi.mock('../../src/utils/notify.js', () => ({
  alert: vi.fn(),
  notifyConfirm: vi.fn(),
  showMessage: vi.fn(),
}));

// Mock de skeleton.js
vi.mock('../../src/utils/skeleton.js', () => ({
  showSkeleton: vi.fn(),
}));

import { setupAjustesView, saveLabConfig } from '../../src/settings/settings.js';
import { DEFAULTS, mergeLabConfig } from '../../src/settings/lab-config.js';

describe('setupAjustesView', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="ajustes-form"></div>';
    mockState.labConfig = null;
  });

  it('renderiza el form con valores de DEFAULTS cuando state.labConfig es null', () => {
    setupAjustesView();
    const form = document.querySelector('#ajustes-form form[data-action="save-lab-config"]');
    expect(form).toBeTruthy();
    expect(form.querySelector('input[name="slotCapacity"]').value).toBe(String(DEFAULTS.slotCapacity));
    expect(form.querySelector('input[name="startHour"]').value).toBe(String(DEFAULTS.startHour));
    expect(form.querySelector('input[name="endHour"]').value).toBe(String(DEFAULTS.endHour));
    expect(form.querySelector('input[name="weeklyLimit"]')).toBeNull();
    expect(form.querySelector('input[name="allowedEmailDomain"]').value).toBe(DEFAULTS.allowedEmailDomain);
  });

  it('renderiza el form con valores de state.labConfig cuando existe', () => {
    mockState.labConfig = { ...DEFAULTS, slotCapacity: 8 };
    setupAjustesView();
    const form = document.querySelector('#ajustes-form form[data-action="save-lab-config"]');
    expect(form.querySelector('input[name="slotCapacity"]').value).toBe('8');
    expect(form.querySelector('input[name="weeklyLimit"]')).toBeNull();
  });

  it('pinta cfg [1..5] (getDay) marcando Lun–Vie con values getDay', () => {
    mockState.labConfig = { ...DEFAULTS, weekDays: [1, 2, 3, 4, 5] };
    setupAjustesView();
    const form = document.querySelector('#ajustes-form form[data-action="save-lab-config"]');
    const checked = form.querySelectorAll('input[name="weekDays"]:checked');
    expect(checked.length).toBe(5);
    expect(Array.from(checked).map(c => c.value)).toEqual(['1', '2', '3', '4', '5']);
    expect(Array.from(checked).map(c => c.closest('label').textContent.trim())).toEqual(
      ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']
    );
  });

  it('muestra skeleton antes de renderizar', async () => {
    const { showSkeleton } = await import('../../src/utils/skeleton.js');
    setupAjustesView();
    expect(showSkeleton).toHaveBeenCalled();
  });
});

describe('saveLabConfig', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form data-action="save-lab-config">
        <input type="number" name="slotCapacity" value="6">
        <input type="number" name="startHour" value="8">
        <input type="number" name="endHour" value="20">
        <input type="checkbox" name="weekDays" value="1" checked>
        <input type="checkbox" name="weekDays" value="2" checked>
        <input type="checkbox" name="weekDays" value="3" checked>
        <input type="text" name="allowedEmailDomain" value="uce.edu.ec">
      </form>
    `;
    mockState.labConfig = null;
    mockSetDoc.mockClear();
    mockDoc.mockClear();
  });

  it('llama setDoc con el merge correcto y actualiza state.labConfig', async () => {
    const form = document.querySelector('form[data-action="save-lab-config"]');
    const fakeEvent = { preventDefault: vi.fn(), target: form };

    await saveLabConfig(fakeEvent, {});

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [docArg, dataArg] = mockSetDoc.mock.calls[0];
    expect(docArg.path).toEqual(['config', 'lab']);
    expect(dataArg).toEqual({
      slotCapacity: 6,
      startHour: 8,
      endHour: 20,
      weekDays: [1, 2, 3],
      allowedEmailDomain: 'uce.edu.ec',
    });
    expect(mockState.labConfig).toEqual(dataArg);
  });

  it('guardar Lun–Vie persiste [1..5] en getDay (no [0..4])', async () => {
    document.body.innerHTML = `
      <form data-action="save-lab-config">
        <input type="number" name="slotCapacity" value="6">
        <input type="number" name="startHour" value="8">
        <input type="number" name="endHour" value="20">
        <input type="checkbox" name="weekDays" value="1" checked>
        <input type="checkbox" name="weekDays" value="2" checked>
        <input type="checkbox" name="weekDays" value="3" checked>
        <input type="checkbox" name="weekDays" value="4" checked>
        <input type="checkbox" name="weekDays" value="5" checked>
        <input type="text" name="allowedEmailDomain" value="uce.edu.ec">
      </form>
    `;
    const form = document.querySelector('form[data-action="save-lab-config"]');
    const fakeEvent = { preventDefault: vi.fn(), target: form };

    await saveLabConfig(fakeEvent, {});

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(mockSetDoc.mock.calls[0][1].weekDays).toEqual([1, 2, 3, 4, 5]);
    expect(mockState.labConfig.weekDays).toEqual([1, 2, 3, 4, 5]);
  });

  it('no llama setDoc si la validación falla', async () => {
    const form = document.querySelector('form[data-action="save-lab-config"]');
    // slotCapacity inválido (0)
    form.querySelector('input[name="slotCapacity"]').value = '0';
    const fakeEvent = { preventDefault: vi.fn(), target: form };

    const { alert } = await import('../../src/utils/notify.js');
    alert.mockClear();

    await saveLabConfig(fakeEvent, {});

    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalled();
  });
});
