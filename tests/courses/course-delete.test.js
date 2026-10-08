import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/firebase-config.js', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
  deleteDoc: vi.fn(),
}));

import { canDeleteCourse, buildCourseDeletionPlan, chunkArray } from '../../src/courses/courses.js';

describe('canDeleteCourse', () => {
  it('permite eliminar solo al admin', () => {
    expect(canDeleteCourse('admin')).toBe(true);
  });

  it('niega al profesor (solo-lectura)', () => {
    expect(canDeleteCourse('professor')).toBe(false);
  });

  it('niega roles desconocidos o vacíos', () => {
    expect(canDeleteCourse('student')).toBe(false);
    expect(canDeleteCourse(undefined)).toBe(false);
    expect(canDeleteCourse('')).toBe(false);
  });
});

describe('buildCourseDeletionPlan', () => {
  it('borra huérfanos antes que el documento del curso', () => {
    const plan = buildCourseDeletionPlan('REDES_A');
    expect(plan.map(s => s.kind)).toEqual(['subcollection', 'query', 'query', 'doc']);
    expect(plan[0].target).toBe('courses/REDES_A/groups');
    expect(plan[plan.length - 1].target).toBe('courses/REDES_A');
  });

  it('incluye reservas y directorio filtrados por courseId', () => {
    const plan = buildCourseDeletionPlan('REDES_A');
    expect(plan[1].target).toContain('reservations');
    expect(plan[1].target).toContain('REDES_A');
    expect(plan[2].target).toContain('student_directory');
    expect(plan[2].target).toContain('REDES_A');
  });
});

describe('chunkArray', () => {
  it('devuelve [] con entrada vacía', () => {
    expect(chunkArray([])).toEqual([]);
  });

  it('trocea múltiplos exactos sin resto', () => {
    expect(chunkArray([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it('conserva el resto final más corto', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('usa 400 por defecto (margen bajo el límite 500 de Firestore)', () => {
    const items = Array.from({ length: 801 }, (_, i) => i);
    const chunks = chunkArray(items);
    expect(chunks.length).toBe(3);
    expect(chunks.map(c => c.length)).toEqual([400, 400, 1]);
  });
});
