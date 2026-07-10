import { describe, it, expect, vi } from 'vitest';

vi.mock('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn()
}));

vi.mock('../../src/groups/group-utils.js', () => ({
  lookupMembersByGroupName: vi.fn(() => []),
  clearGroupUtilsCache: vi.fn()
}));

const { sortReportData, buildReportRows } = await import('../../src/reports/reports.js');

describe('sortReportData', () => {
  it('ordena por fecha asc', () => {
    const data = [
      { Fecha: '2026-07-10', Grupo: 'G1', Estudiante: 'A' },
      { Fecha: '2026-07-09', Grupo: 'G1', Estudiante: 'B' }
    ];
    const sorted = sortReportData(data);
    expect(sorted[0].Fecha).toBe('2026-07-09');
    expect(sorted[1].Fecha).toBe('2026-07-10');
  });

  it('ordena por grupo dentro de misma fecha', () => {
    const data = [
      { Fecha: '2026-07-09', Grupo: 'G2', Estudiante: 'A' },
      { Fecha: '2026-07-09', Grupo: 'G1', Estudiante: 'B' }
    ];
    const sorted = sortReportData(data);
    expect(sorted[0].Grupo).toBe('G1');
    expect(sorted[1].Grupo).toBe('G2');
  });

  it('ordena por estudiante dentro de mismo grupo y fecha', () => {
    const data = [
      { Fecha: '2026-07-09', Grupo: 'G1', Estudiante: 'Zeta' },
      { Fecha: '2026-07-09', Grupo: 'G1', Estudiante: 'Alpha' }
    ];
    const sorted = sortReportData(data);
    expect(sorted[0].Estudiante).toBe('Alpha');
    expect(sorted[1].Estudiante).toBe('Zeta');
  });

  it('ordena compuesto: fecha, grupo, estudiante', () => {
    const data = [
      { Fecha: '2026-07-10', Grupo: 'G1', Estudiante: 'M' },
      { Fecha: '2026-07-09', Grupo: 'G2', Estudiante: 'N' },
      { Fecha: '2026-07-09', Grupo: 'G1', Estudiante: 'Z' },
      { Fecha: '2026-07-09', Grupo: 'G1', Estudiante: 'A' }
    ];
    const sorted = sortReportData(data);
    expect(sorted[0]).toEqual({ Fecha: '2026-07-09', Grupo: 'G1', Estudiante: 'A' });
    expect(sorted[1]).toEqual({ Fecha: '2026-07-09', Grupo: 'G1', Estudiante: 'Z' });
    expect(sorted[2]).toEqual({ Fecha: '2026-07-09', Grupo: 'G2', Estudiante: 'N' });
    expect(sorted[3]).toEqual({ Fecha: '2026-07-10', Grupo: 'G1', Estudiante: 'M' });
  });

  it('no muta el array original', () => {
    const data = [
      { Fecha: '2026-07-10', Grupo: 'G1', Estudiante: 'A' },
      { Fecha: '2026-07-09', Grupo: 'G1', Estudiante: 'B' }
    ];
    const sorted = sortReportData(data);
    expect(data[0].Fecha).toBe('2026-07-10');
    expect(sorted[0].Fecha).toBe('2026-07-09');
  });
});

describe('buildReportRows', () => {
  const coursesCache = {
    'REDES_A': { subject: 'Redes', parallel: 'A' }
  };

  function makeDoc(data) {
    return { data: () => data };
  }

  it('construye fila para grupo sin integrantes', () => {
    const docs = [makeDoc({
      courseId: 'REDES_A', groupName: 'G1', date: '2026-07-09', hour: 10
    })];
    const rows = buildReportRows(docs, ['REDES_A'], coursesCache, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]['Curso']).toBe('Redes (A)');
    expect(rows[0]['Estudiante']).toBe('Sin integrantes en el sistema');
  });

  it('construye filas para cada integrante', () => {
    const docs = [makeDoc({
      courseId: 'REDES_A', groupName: 'G1', date: '2026-07-09', hour: 10,
      attendanceDetail: { '123': true, '456': false }
    })];
    const groupsCache = {
      'G1': [{ cedula: '123', nombre: 'Alice' }, { cedula: '456', nombre: 'Bob' }]
    };
    const rows = buildReportRows(docs, ['REDES_A'], coursesCache, groupsCache);
    expect(rows).toHaveLength(2);
    expect(rows[0]['Cédula']).toBe('123');
    expect(rows[0]['Estado Asistencia']).toBe('Presente');
    expect(rows[1]['Cédula']).toBe('456');
    expect(rows[1]['Estado Asistencia']).toBe('Ausente');
  });

  it('filtra cursos no seleccionados', () => {
    const docs = [
      makeDoc({ courseId: 'REDES_A', groupName: 'G1', date: '2026-07-09', hour: 10 }),
      makeDoc({ courseId: 'OTRO', groupName: 'G2', date: '2026-07-09', hour: 11 })
    ];
    const rows = buildReportRows(docs, ['REDES_A'], coursesCache, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]['Grupo']).toBe('G1');
  });

  it('asigna "No Registrada" si no hay attendanceDetail', () => {
    const docs = [makeDoc({
      courseId: 'REDES_A', groupName: 'G1', date: '2026-07-09', hour: 10
    })];
    const groupsCache = {
      'G1': [{ cedula: '123', nombre: 'Alice' }]
    };
    const rows = buildReportRows(docs, ['REDES_A'], coursesCache, groupsCache);
    expect(rows[0]['Estado Asistencia']).toBe('No Registrada');
  });
});
