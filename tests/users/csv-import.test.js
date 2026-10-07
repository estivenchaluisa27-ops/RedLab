import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDoc = vi.fn();
const mockWriteBatch = vi.fn();

vi.mock('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js', () => ({
  doc: mockDoc,
  writeBatch: mockWriteBatch,
}));

const { parseMatriculaCSV, importMatriculaBatch } = await import('../../src/users/csv-import.js');

describe('parseMatriculaCSV', () => {
  it('parsea CSV válido', () => {
    const csv = 'email,cedula,nombre,cursoId,grupo\ns1@uce.edu.ec,123,Student One,REDES_A,G1\ns2@uce.edu.ec,456,Student Two,REDES_A,G2';
    const { rows, errors } = parseMatriculaCSV(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ email: 's1@uce.edu.ec', cedula: '123', nombre: 'Student One', cursoId: 'REDES_A', grupo: 'G1' });
  });

  it('normaliza emails a minúsculas', () => {
    const csv = 'email,cedula,nombre,cursoId,grupo\n  Test@UCE.edu.ec  ,123,Test,REDES_A,G1';
    const { rows, errors } = parseMatriculaCSV(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0].email).toBe('test@uce.edu.ec');
  });

  it('reporta error si faltan columnas', () => {
    const csv = 'email,cedula,nombre\ns1@uce.edu.ec,123,Student';
    const { rows, errors } = parseMatriculaCSV(csv);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(2);
    expect(rows).toHaveLength(0);
  });

  it('reporta error si email está vacío', () => {
    const csv = 'email,cedula,nombre,cursoId,grupo\n,123,Student,REDES_A,G1';
    const { rows, errors } = parseMatriculaCSV(csv);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Email');
    expect(rows).toHaveLength(0);
  });

  it('reporta error si cédula está vacía', () => {
    const csv = 'email,cedula,nombre,cursoId,grupo\ns1@uce.edu.ec,,Student,REDES_A,G1';
    const { rows, errors } = parseMatriculaCSV(csv);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Cédula');
  });

  it('ignora líneas vacías', () => {
    const csv = 'email,cedula,nombre,cursoId,grupo\n\ns1@uce.edu.ec,123,Student,REDES_A,G1\n\n';
    const { rows, errors } = parseMatriculaCSV(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });

  it('maneja CRLF', () => {
    const csv = 'email,cedula,nombre,cursoId,grupo\r\ns1@uce.edu.ec,123,Student,REDES_A,G1\r\n';
    const { rows, errors } = parseMatriculaCSV(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });

  it('parsea 20 filas correctamente', () => {
    const lines = ['email,cedula,nombre,cursoId,grupo'];
    for (let i = 1; i <= 20; i++) {
      lines.push(`s${i}@uce.edu.ec,${1000 + i},Student ${i},REDES_A,G${i}`);
    }
    const csv = lines.join('\n');
    const { rows, errors } = parseMatriculaCSV(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(20);
  });
});

describe('importMatriculaBatch', () => {
  const mockDb = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockReturnValue('mock-doc-ref');
    mockWriteBatch.mockReturnValue({
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(),
    });
  });

  it('importa filas con batch', async () => {
    const rows = [
      { email: 's1@uce.edu.ec', cedula: '123', nombre: 'Student 1', courseId: 'REDES_A', grupo: 'G1' },
      { email: 's2@uce.edu.ec', cedula: '456', nombre: 'Student 2', courseId: 'REDES_A', grupo: 'G2' },
    ];
    const result = await importMatriculaBatch(mockDb, rows, { REDES_A: { subject: 'Redes' } });
    expect(result.success).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(mockWriteBatch).toHaveBeenCalled();
  });

  it('es idempotente (re-import actualiza)', async () => {
    const rows = [
      { email: 's1@uce.edu.ec', cedula: '123', nombre: 'Student Updated', courseId: 'REDES_A', grupo: 'G1' },
    ];
    const result = await importMatriculaBatch(mockDb, rows, { REDES_A: { subject: 'Redes' } });
    expect(result.success).toBe(1);
    expect(mockWriteBatch).toHaveBeenCalled();
  });

  it('reporta errores individuales', async () => {
    const rows = [
      { email: 's1@uce.edu.ec', cedula: '123', nombre: 'Student 1', courseId: 'REDES_A', grupo: 'G1' },
      { email: 's2@uce.edu.ec', cedula: '456', nombre: 'Student 2', courseId: 'REDES_A', grupo: 'G2' },
    ];
    mockWriteBatch.mockReturnValue({
      set: vi.fn().mockImplementation(() => {
        throw new Error('Firestore error');
      }),
      commit: vi.fn().mockResolvedValue(),
    });
    const result = await importMatriculaBatch(mockDb, rows, {});
    expect(result.success).toBe(0);
    expect(result.errors).toHaveLength(2);
  });

  it('procesa en chunks de 200 (2 ops/fila → ≤500 ops por batch)', async () => {
    const rows = [];
    for (let i = 0; i < 500; i++) {
      rows.push({ email: `s${i}@uce.edu.ec`, cedula: `${i}`, nombre: `Student ${i}`, cursoId: 'REDES_A', grupo: 'G1' });
    }
    const result = await importMatriculaBatch(mockDb, rows, {});
    expect(result.success).toBe(500);
    expect(mockWriteBatch).toHaveBeenCalledTimes(3);
  });

  it('ningún batch supera 500 ops con ≥251 filas (2 sets por fila)', async () => {
    const batches = [];
    mockWriteBatch.mockImplementation(() => {
      const b = { set: vi.fn(), commit: vi.fn().mockResolvedValue() };
      batches.push(b);
      return b;
    });
    const rows = [];
    for (let i = 0; i < 251; i++) {
      rows.push({ email: `s${i}@uce.edu.ec`, cedula: `${i}`, nombre: `Student ${i}`, cursoId: 'REDES_A', grupo: 'G1' });
    }
    const result = await importMatriculaBatch(mockDb, rows, {});
    expect(result.success).toBe(251);
    expect(result.errors).toHaveLength(0);
    expect(batches.length).toBeGreaterThan(1);
    for (const b of batches) {
      expect(b.set.mock.calls.length).toBeLessThanOrEqual(400);
    }
  });

  it('usa coursesCache para courseName', async () => {
    const rows = [
      { email: 's1@uce.edu.ec', cedula: '123', nombre: 'Student 1', cursoId: 'REDES_A', grupo: 'G1' },
    ];
    const setMock = vi.fn();
    mockWriteBatch.mockReturnValue({ set: setMock, commit: vi.fn().mockResolvedValue() });
    await importMatriculaBatch(mockDb, rows, { REDES_A: { subject: 'Redes A' } });
    // La segunda llamada a set es para student_directory (dirData), que sí incluye courseName
    expect(setMock).toHaveBeenLastCalledWith(
      'mock-doc-ref',
      expect.objectContaining({ courseName: 'Redes A' }),
      expect.anything()
    );
  });
});
