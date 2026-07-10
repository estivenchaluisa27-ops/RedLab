import { describe, it, expect } from 'vitest';
import { buildCourseId } from '../../src/courses/course-utils.js';

describe('buildCourseId', () => {
  it('construye ID básico', () => {
    expect(buildCourseId('Redes', 'A')).toBe('REDES_A');
  });

  it('convierte a mayúsculas', () => {
    expect(buildCourseId('programacion', 'b')).toBe('PROGRAMACION_B');
  });

  it('reemplaza espacios con guiones bajos', () => {
    expect(buildCourseId('Redes de Computadoras', 'A')).toBe('REDES_DE_COMPUTADORAS_A');
  });

  it('elimina caracteres especiales', () => {
    expect(buildCourseId('Redes!@#$%', 'A-1')).toBe('REDES_A1');
  });

  it('maneja paralelos con números', () => {
    expect(buildCourseId('Redes', '1')).toBe('REDES_1');
  });

  it('elimina espacios en paralelo', () => {
    expect(buildCourseId('Redes', 'A B')).toBe('REDES_AB');
  });

  it('maneja caracteres vacíos después de limpieza', () => {
    expect(buildCourseId('!!!', '!!!')).toBe('_');
  });
});
