import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import { clampDayIndex, nextWeekLanding, getWeekDays, formatDateYYYYMMDD } from '../../src/utils/dates.js';
import { state } from '../../src/state.js';
import {
  initStudentDayView,
  syncStudentDayView,
  selectStudentDay,
  formatHourRange,
} from '../../src/calendar/student-day-view.js';

describe('clampDayIndex', () => {
  it('deja el rango L–V (0-4) intacto', () => {
    expect([0, 1, 2, 3, 4].map(clampDayIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it('recorta por debajo y por encima', () => {
    expect(clampDayIndex(-3)).toBe(0);
    expect(clampDayIndex(-1)).toBe(0);
    expect(clampDayIndex(5)).toBe(4);
    expect(clampDayIndex(9)).toBe(4);
  });

  it('trunca decimales y acepta strings numéricos', () => {
    expect(clampDayIndex(2.9)).toBe(2);
    expect(clampDayIndex('3')).toBe(3);
  });

  it('cae a 0 con valores no numéricos', () => {
    expect(clampDayIndex(NaN)).toBe(0);
    expect(clampDayIndex(undefined)).toBe(0);
    expect(clampDayIndex(null)).toBe(0);
    expect(clampDayIndex('lun')).toBe(0);
  });
});

describe('nextWeekLanding', () => {
  it('viernes + adelante => semana siguiente, aterriza en lunes', () => {
    expect(nextWeekLanding(4, 1)).toEqual({ weekDelta: 1, landingIndex: 0 });
  });

  it('lunes + atrás => semana anterior, aterriza en viernes', () => {
    expect(nextWeekLanding(0, -1)).toEqual({ weekDelta: -1, landingIndex: 4 });
  });

  it('no salta en días intermedios ni en dirección interior', () => {
    expect(nextWeekLanding(2, 1)).toEqual({ weekDelta: 0, landingIndex: 2 });
    expect(nextWeekLanding(2, -1)).toEqual({ weekDelta: 0, landingIndex: 2 });
    expect(nextWeekLanding(0, 1)).toEqual({ weekDelta: 0, landingIndex: 0 });
    expect(nextWeekLanding(4, -1)).toEqual({ weekDelta: 0, landingIndex: 4 });
  });

  it('tolera índices fuera de rango antes de decidir', () => {
    expect(nextWeekLanding(9, 1)).toEqual({ weekDelta: 1, landingIndex: 0 });
    expect(nextWeekLanding(-2, -1)).toEqual({ weekDelta: -1, landingIndex: 4 });
  });
});

describe('mapeo índice<->fecha con getWeekDays', () => {
  it('devuelve 5 días lun–vie consecutivos', () => {
    const week = getWeekDays(0);
    expect(week).toHaveLength(5);
    expect(week.map((d) => d.getDay())).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < 5; i++) {
      expect(week[i].getTime() - week[i - 1].getTime()).toBe(24 * 60 * 60 * 1000);
    }
  });

  it('cada índice 0-4 mapea a una fecha YYYY-MM-DD válida y distinta', () => {
    const week = getWeekDays(0);
    const strs = week.map((d, i) => formatDateYYYYMMDD(week[clampDayIndex(i)]));
    expect(strs).toHaveLength(5);
    expect(new Set(strs).size).toBe(5);
    strs.forEach((s) => expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('el offset cambia de semana pero conserva lun–vie', () => {
    const a = getWeekDays(0).map((d) => formatDateYYYYMMDD(d));
    const b = getWeekDays(1).map((d) => formatDateYYYYMMDD(d));
    expect(b[0] > a[4]).toBe(true);
    expect(getWeekDays(1).map((d) => d.getDay())).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('vista-día móvil (tira + carrusel)', () => {
  const freeClassify = () => ({ type: 'free', className: 'slot-free', label: 'Disponible', disabled: false });
  const week = getWeekDays(0);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  beforeAll(() => {
    document.body.innerHTML = `<div id="student-day-strip" role="tablist"></div>`
      + `<div id="student-day-carousel">`
      + [0, 1, 2, 3, 4].map((i) => `<section data-day-index="${i}"></section>`).join('')
      + `</div>`;
    initStudentDayView({});
  });

  beforeEach(async () => {
    state.activeDayIndex = 1;
    state.selectedSlots = [];
    syncStudentDayView(week, [], freeClassify);
    await sleep(250); // libera el flag isProgrammatic del scroll inicial
  });

  it('pinta 5 tabs con aria-selected en el día activo', () => {
    const tabs = document.querySelectorAll('#student-day-strip [role="tab"]');
    expect(tabs).toHaveLength(5);
    tabs.forEach((t, i) => {
      expect(t.dataset.action).toBe('student-day-select');
      expect(t.dataset.dayIndex).toBe(String(i));
      expect(t.getAttribute('aria-selected')).toBe(i === 1 ? 'true' : 'false');
    });
    expect(tabs[1].classList.contains('day-active')).toBe(true);
  });

  it('pinta 5 páginas con 13 tarjetas/hora y data-action intacto', () => {
    const sections = document.querySelectorAll('#student-day-carousel section[data-day-index]');
    expect(sections).toHaveLength(5);
    sections.forEach((sec, i) => {
      const cards = sec.querySelectorAll('button[data-action="student-slot-toggle"]');
      expect(cards).toHaveLength(13);
      const dateStr = formatDateYYYYMMDD(week[i]);
      expect(cards[0].id).toBe(`${dateStr}_7`);
      expect(cards[12].id).toBe(`${dateStr}_19`);
    });
  });

  it('selectStudentDay cambia el día y la tira', () => {
    selectStudentDay(3);
    expect(state.activeDayIndex).toBe(3);
    const tabs = document.querySelectorAll('#student-day-strip [role="tab"]');
    expect(tabs[3].classList.contains('day-active')).toBe(true);
    expect(tabs[3].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
  });

  it('al asentar página el scroll sincroniza la tira', async () => {
    const carousel = document.getElementById('student-day-carousel');
    carousel.scrollLeft = 4; // clientWidth=0 en jsdom => pageWidth 1 => página 4
    carousel.dispatchEvent(new Event('scroll'));
    await sleep(250); // debounce de settle (~120ms)
    expect(state.activeDayIndex).toBe(4);
    const tabs = document.querySelectorAll('#student-day-strip [role="tab"]');
    expect(tabs[4].classList.contains('day-active')).toBe(true);
  });
});

describe('vista-día: rango horario y etiquetas de estado', () => {
  // Semana lejana en el futuro: ningún slot es pasado y el texto depende
  // solo de los docs (determinista, sin flakiness por fecha actual).
  const futureWeek = getWeekDays(520);
  const futureDate = formatDateYYYYMMDD(futureWeek[0]);
  const stubClassify = (dateStr, h, arr) => {
    if (arr.some((d) => d.status === 'blocked')) {
      return { type: 'blocked', className: 'slot-blocked', label: 'Bloqueado', disabled: true };
    }
    // Producción cuenta grupos únicos (Set en classifySlot): replicarlo para
    // que el stub no diverja con reservas duplicadas del mismo grupo.
    const approved = new Set(arr.filter((d) => d.status === 'approved').map((d) => d.groupName)).size;
    if (approved >= 4) return { type: 'full', className: 'slot-full', label: 'Lleno', disabled: true };
    if (approved > 0) {
      return { type: 'partial', className: 'slot-partial', label: 'Disp.', disabled: false, occupancy: approved };
    }
    return { type: 'free', className: 'slot-free', label: 'Disponible', disabled: false };
  };

  beforeAll(() => {
    document.body.innerHTML = `<div id="student-day-strip" role="tablist"></div>`
      + `<div id="student-day-carousel">`
      + [0, 1, 2, 3, 4].map((i) => `<section data-day-index="${i}"></section>`).join('')
      + `</div>`;
    initStudentDayView({});
  });

  it('formatHourRange usa 24h con rango completo', () => {
    expect(formatHourRange(7)).toBe('07:00 - 08:00');
    expect(formatHourRange(13)).toBe('13:00 - 14:00');
    expect(formatHourRange(19)).toBe('19:00 - 20:00');
  });

  it('la columna hora muestra el rango y cada bloque su estado', () => {
    state.activeDayIndex = 0;
    state.selectedSlots = [];
    const docs = [
      { id: 'b1', date: futureDate, hour: 8, status: 'blocked' },
      { id: 'p1', date: futureDate, hour: 9, status: 'approved', groupName: 'G1' },
      { id: 'f1', date: futureDate, hour: 10, status: 'approved', groupName: 'G1' },
      { id: 'f2', date: futureDate, hour: 10, status: 'approved', groupName: 'G2' },
      { id: 'f3', date: futureDate, hour: 10, status: 'approved', groupName: 'G3' },
      { id: 'f4', date: futureDate, hour: 10, status: 'approved', groupName: 'G4' },
    ];
    syncStudentDayView(futureWeek, docs, stubClassify);
    const sec = document.querySelector('#student-day-carousel section[data-day-index="0"]');
    const text = (id) => document.getElementById(id)?.textContent ?? '';
    expect(text(`${futureDate}_7`)).toContain('Disponible');
    expect(text(`${futureDate}_8`)).toContain('Bloqueado');
    expect(text(`${futureDate}_9`)).toContain('Parcial 1/4');
    expect(text(`${futureDate}_10`)).toContain('Lleno');
    const hours = [...sec.querySelectorAll('.day-card-hour')].map((el) => el.textContent);
    expect(hours[0]).toBe('07:00 - 08:00');
    expect(hours[1]).toBe('08:00 - 09:00');
    expect(hours).toHaveLength(13);
  });
});
