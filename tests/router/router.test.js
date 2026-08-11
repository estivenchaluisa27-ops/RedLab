import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseHash, currentSection, navigate, onBeforeLeave, initRouter, destroyRouter } from '../../src/router.js';

beforeEach(() => {
  destroyRouter();
  window.location.hash = '';
});

afterEach(() => {
  destroyRouter();
  window.location.hash = '';
});

describe('router — parseHash', () => {
  it('retorna calendario por default cuando el hash está vacío', () => {
    window.location.hash = '';
    expect(parseHash()).toEqual({ section: 'calendario', params: {} });
  });

  it('parsea #/admin/calendario', () => {
    window.location.hash = '#/admin/calendario';
    expect(parseHash().section).toBe('calendario');
  });

  it('parsea #/admin/cursos', () => {
    window.location.hash = '#/admin/cursos';
    expect(parseHash().section).toBe('cursos');
  });

  it('cae a calendario si la sección no existe en SECTIONS', () => {
    window.location.hash = '#/admin/noexiste';
    expect(parseHash().section).toBe('calendario');
  });

  it('cae a calendario si no hay segmento admin', () => {
    window.location.hash = '#/foo/bar';
    expect(parseHash().section).toBe('calendario');
  });

  it('currentSection retorna la misma sección que parseHash', () => {
    window.location.hash = '#/admin/cursos';
    expect(currentSection()).toBe(parseHash().section);
  });
});

describe('router — navigate', () => {
  it('cambia el hash del navegador', () => {
    navigate('#/admin/cursos');
    expect(window.location.hash).toBe('#/admin/cursos');
  });

  it('normaliza path sin # inicial', () => {
    navigate('/admin/calendario');
    expect(window.location.hash).toBe('#/admin/calendario');
  });

  it('normaliza path sin / inicial', () => {
    navigate('admin/cursos');
    expect(window.location.hash).toBe('#/admin/cursos');
  });

  it('si el hash es idéntico, llama onRoute manualmente sin disparar hashchange extra', () => {
    const onRoute = vi.fn();
    initRouter(onRoute);
    navigate('#/admin/cursos');   // primer navigate: cambia el hash, dispara hashchange
    onRoute.mockClear();
    navigate('#/admin/cursos');    // mismo hash → llamado manual (1 vez)
    expect(onRoute).toHaveBeenCalledTimes(1);
  });
});

describe('router — initRouter', () => {
  it('dispara onRoute con la ruta inicial al arrancar', () => {
    const onRoute = vi.fn();
    initRouter(onRoute);
    expect(onRoute).toHaveBeenCalledTimes(1);
    expect(onRoute.mock.calls[0][0].section).toBe('calendario');
  });

  it('es idempotente: segundo initRouter no registra un segundo listener', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const onRoute1 = vi.fn();
    initRouter(onRoute1);
    const hashListenersAfterFirst = addSpy.mock.calls.filter(([evt]) => evt === 'hashchange').length;
    const onRoute2 = vi.fn();
    initRouter(onRoute2);
    const hashListenersAfterSecond = addSpy.mock.calls.filter(([evt]) => evt === 'hashchange').length;
    // El segundo initRouter no debió agregar un nuevo listener (idempotencia).
    expect(hashListenersAfterSecond).toBe(hashListenersAfterFirst);
    expect(hashListenersAfterFirst).toBe(1);
    expect(onRoute2).toHaveBeenCalledTimes(1);
    addSpy.mockRestore();
  });

  it('un único hashchange dispara onRoute una sola vez', () => {
    const onRoute = vi.fn();
    initRouter(onRoute);
    onRoute.mockClear();
    // Disparamos el evento manualmente en lugar de setear el hash (determinismo en jsdom).
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(onRoute).toHaveBeenCalledTimes(1);
  });
});

describe('router — destroyRouter', () => {
  it('remueve el listener, no llama onRoute tras destroy', async () => {
    const onRoute = vi.fn();
    initRouter(onRoute);
    onRoute.mockClear();
    destroyRouter();
    window.location.hash = '#/admin/cursos';
    await new Promise(r => setTimeout(r, 5));
    expect(onRoute).not.toHaveBeenCalled();
  });
});

describe('router — onBeforeLeave', () => {
  it('retorna una función de desuscripción', () => {
    const unsub = onBeforeLeave(() => true);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('almacena el callback sin fallar cuando se invoca navigate', () => {
    const cb = vi.fn(() => true);
    const unsub = onBeforeLeave(cb);
    const onRoute = vi.fn();
    initRouter(onRoute);
    navigate('#/admin/cursos');
    expect(window.location.hash).toBe('#/admin/cursos');
    unsub();
  });
});
