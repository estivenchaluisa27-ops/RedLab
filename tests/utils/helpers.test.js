import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeEmail, isUceEmail } from '../../src/utils/uce-email.js';
import { buildGroupPayload, buildOrphanCleanupQuery } from '../../src/utils/groups-helpers.js';

vi.mock('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js', () => ({
  collection: vi.fn(() => 'mocked-collection'),
  getDocs: vi.fn(),
}));

const { getDocs } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
const { fetchProfessors, loadProfessorsInto } = await import('../../src/utils/professors.js');

function fakeProfSnap(docs) {
  return {
    forEach(cb) {
      docs.forEach((d) => cb({ id: d.email, data: () => ({ name: d.name }) }));
    },
  };
}

describe('normalizeEmail', () => {
  it('recorta espacios y pasa a minúsculas', () => {
    expect(normalizeEmail('  USER@UCE.edu.ec  ')).toBe('user@uce.edu.ec');
  });

  it('retorna string vacío para null/undefined', () => {
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });
});

describe('isUceEmail', () => {
  it('acepta correo @uce.edu.ec válido', () => {
    expect(isUceEmail('jefe.grupo-1@uce.edu.ec')).toBe(true);
  });

  it('rechaza otro dominio', () => {
    expect(isUceEmail('user@gmail.com')).toBe(false);
  });

  it('rechaza formato inválido', () => {
    expect(isUceEmail('sin-arroba')).toBe(false);
    expect(isUceEmail('')).toBe(false);
  });

  it('rechaza no-strings', () => {
    expect(isUceEmail(null)).toBe(false);
    expect(isUceEmail(undefined)).toBe(false);
    expect(isUceEmail(123)).toBe(false);
  });

  it('soporta dominio personalizado', () => {
    expect(isUceEmail('user@epn.edu.ec', 'epn.edu.ec')).toBe(true);
    expect(isUceEmail('user@uce.edu.ec', 'epn.edu.ec')).toBe(false);
  });

  it('valida el flujo auth-ui: normalizeEmail + isUceEmail', () => {
    expect(isUceEmail(normalizeEmail('  JEFE@uce.edu.ec '))).toBe(true);
  });
});

describe('buildGroupPayload', () => {
  const base = {
    name: 'G1',
    email: 'LIDER@uce.edu.ec',
    cedula: '0102030405',
    fullName: 'Líder Uno',
    courseId: 'REDES_A',
    courseName: 'Redes',
  };

  it('construye groupRef como path courses/courseId/groups/email normalizado', () => {
    const { groupRef } = buildGroupPayload(base);
    expect(groupRef).toEqual(['courses', 'REDES_A', 'groups', 'lider@uce.edu.ec']);
  });

  it('construye groupData con líder y members', () => {
    const { groupData } = buildGroupPayload(base);
    expect(groupData).toEqual({
      name: 'G1',
      leader: { email: 'lider@uce.edu.ec', cedula: '0102030405', fullName: 'Líder Uno' },
      members: [{ cedula: '0102030405', nombre: 'Líder Uno', isLeader: true }],
    });
  });

  it('construye dirData de student_directory con groupId=email', () => {
    const { dirData } = buildGroupPayload(base);
    expect(dirData).toEqual({
      courseId: 'REDES_A',
      courseName: 'Redes',
      email: 'lider@uce.edu.ec',
      groupId: 'lider@uce.edu.ec',
      role: 'student',
    });
  });
});

describe('buildOrphanCleanupQuery', () => {
  it('describe colección reservations con filtros groupName y courseId', () => {
    expect(buildOrphanCleanupQuery('REDES_A', 'G1')).toEqual({
      collection: 'reservations',
      filters: [
        { field: 'groupName', op: '==', value: 'G1' },
        { field: 'courseId', op: '==', value: 'REDES_A' },
      ],
    });
  });
});

describe('fetchProfessors', () => {
  const mockDb = {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve [{email, name}] desde la colección professors', async () => {
    getDocs.mockResolvedValue(
      fakeProfSnap([
        { email: 'a@uce.edu.ec', name: 'Prof A' },
        { email: 'b@uce.edu.ec', name: 'Prof B' },
      ]),
    );
    const result = await fetchProfessors(mockDb);
    expect(result).toEqual([
      { email: 'a@uce.edu.ec', name: 'Prof A' },
      { email: 'b@uce.edu.ec', name: 'Prof B' },
    ]);
  });

  it('devuelve array vacío si no hay profesores', async () => {
    getDocs.mockResolvedValue(fakeProfSnap([]));
    expect(await fetchProfessors(mockDb)).toEqual([]);
  });
});

describe('loadProfessorsInto', () => {
  const mockDb = {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('puebla el select con placeholder y opciones', async () => {
    getDocs.mockResolvedValue(fakeProfSnap([{ email: 'a@uce.edu.ec', name: 'Prof A' }]));
    const sel = document.createElement('select');
    const result = await loadProfessorsInto(mockDb, sel);
    expect(result).toEqual([{ email: 'a@uce.edu.ec', name: 'Prof A' }]);
    expect(sel.innerHTML).toContain('Seleccione Profesor...');
    expect(sel.innerHTML).toContain('value="a@uce.edu.ec"');
    expect(sel.innerHTML).toContain('Prof A');
  });

  it('marca selectedEmail como selected', async () => {
    getDocs.mockResolvedValue(
      fakeProfSnap([
        { email: 'a@uce.edu.ec', name: 'Prof A' },
        { email: 'b@uce.edu.ec', name: 'Prof B' },
      ]),
    );
    const sel = document.createElement('select');
    await loadProfessorsInto(mockDb, sel, 'b@uce.edu.ec');
    expect(sel.innerHTML).toContain('value="b@uce.edu.ec" selected');
  });

  it('escapa nombres con HTML peligroso', async () => {
    getDocs.mockResolvedValue(fakeProfSnap([{ email: 'x@uce.edu.ec', name: '<script>alert(1)</script>' }]));
    const sel = document.createElement('select');
    await loadProfessorsInto(mockDb, sel);
    expect(sel.innerHTML).not.toContain('<script>');
    expect(sel.innerHTML).toContain('&lt;script&gt;');
  });

  it('retorna [] sin tocar nada si no hay select', async () => {
    expect(await loadProfessorsInto(mockDb, null)).toEqual([]);
    expect(getDocs).not.toHaveBeenCalled();
  });
});
