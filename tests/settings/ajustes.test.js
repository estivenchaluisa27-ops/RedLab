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
    expect(form.querySelector('input[name="weeklyLimit"]').value).toBe(String(DEFAULTS.weeklyLimit));
    expect(form.querySelector('input[name="allowedEmailDomain"]').value).toBe(DEFAULTS.allowedEmailDomain);
  });

  it('renderiza el form con valores de state.labConfig cuando existe', () => {
    mockState.labConfig = { ...DEFAULTS, slotCapacity: 8, weeklyLimit: 6 };
    setupAjustesView();
    const form = document.querySelector('#ajustes-form form[data-action="save-lab-config"]');
    expect(form.querySelector('input[name="slotCapacity"]').value).toBe('8');
    expect(form.querySelector('input[name="weeklyLimit"]').value).toBe('6');
  });

  it('marca los checkboxes de weekDays según la config', () => {
    mockState.labConfig = { ...DEFAULTS, weekDays: [0, 2, 4] };
    setupAjustesView();
    const form = document.querySelector('#ajustes-form form[data-action="save-lab-config"]');
    const checked = form.querySelectorAll('input[name="weekDays"]:checked');
    expect(checked.length).toBe(3);
    expect(Array.from(checked).map(c => c.value)).toEqual(['0', '2', '4']);
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
        <input type="number" name="weeklyLimit" value="5">
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
      weeklyLimit: 5,
      allowedEmailDomain: 'uce.edu.ec',
    });
    expect(mockState.labConfig).toEqual(dataArg);
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
