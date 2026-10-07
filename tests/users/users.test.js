import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de Firestore
const mockDocs = vi.fn();
const mockDoc = vi.fn();
const mockCollection = vi.fn();
const mockSetDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockWriteBatch = vi.fn();
const mockQuery = vi.fn();
const mockWhere = vi.fn();

vi.mock('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js', () => ({
  collection: mockCollection,
  doc: mockDoc,
  getDocs: mockGetDocs,
  getDoc: mockGetDoc,
  setDoc: mockSetDoc,
  deleteDoc: mockDeleteDoc,
  writeBatch: mockWriteBatch,
  query: mockQuery,
  where: mockWhere,
}));

// Mock de group-utils
vi.mock('../../src/groups/group-utils.js', () => ({
  clearGroupUtilsCache: vi.fn(),
}));

const { initUsuarios, listAdmins, saveAdmin, deleteAdmin, listProfessors, saveProfessor, deleteProfessor, listStudentDirectory, moveStudent, deleteStudent } = await import('../../src/users/users-store.js');
const { clearGroupUtilsCache } = await import('../../src/groups/group-utils.js');

describe('users-store', () => {
  const mockDb = {};
  const mockState = { user: { email: 'admin@uce.edu.ec' }, coursesCache: {} };

  beforeEach(() => {
    vi.clearAllMocks();
    initUsuarios(mockDb, mockState);
  });

  describe('Admins', () => {
    it('lista admins', async () => {
      mockGetDocs.mockResolvedValue({
        forEach: (cb) => {
          cb({ id: 'a@uce.edu.ec', data: () => ({ name: 'Admin 1', email: 'a@uce.edu.ec' }) });
          cb({ id: 'b@uce.edu.ec', data: () => ({ name: 'Admin 2', email: 'b@uce.edu.ec' }) });
        },
      });

      const result = await listAdmins();
      expect(result).toHaveLength(2);
      expect(result[0].email).toBe('a@uce.edu.ec');
    });

    it('guarda admin normalizando email', async () => {
      mockSetDoc.mockResolvedValue();
      await saveAdmin('  Test@UCE.edu.ec  ', 'Test');
      expect(mockSetDoc).toHaveBeenCalledWith(
        mockDoc.mock.results[0].value,
        expect.objectContaining({ email: 'test@uce.edu.ec', name: 'Test' })
      );
    });

    it('elimina admin', async () => {
      mockGetDocs.mockResolvedValue({
        forEach: (cb) => {
          cb({ id: 'a@uce.edu.ec', data: () => ({}) });
          cb({ id: 'b@uce.edu.ec', data: () => ({}) });
        },
      });
      mockDeleteDoc.mockResolvedValue();
      await deleteAdmin('a@uce.edu.ec', 'b@uce.edu.ec');
      expect(mockDeleteDoc).toHaveBeenCalled();
    });

    it('no permite auto-eliminarse', async () => {
      await expect(deleteAdmin('admin@uce.edu.ec', 'admin@uce.edu.ec'))
        .rejects.toThrow('No puedes eliminarte a ti mismo.');
    });

    it('no permite dejar 0 admins', async () => {
      mockGetDocs.mockResolvedValue({
        forEach: (cb) => {
          cb({ id: 'a@uce.edu.ec', data: () => ({}) });
        },
      });
      await expect(deleteAdmin('a@uce.edu.ec', 'b@uce.edu.ec'))
        .rejects.toThrow('Debe existir al menos 1 admin.');
    });
  });

  describe('Professors', () => {
    it('lista profesores', async () => {
      mockGetDocs.mockResolvedValue({
        forEach: (cb) => {
          cb({ id: 'p@uce.edu.ec', data: () => ({ name: 'Prof 1' }) });
        },
      });
      const result = await listProfessors();
      expect(result).toHaveLength(1);
    });

    it('guarda profesor', async () => {
      mockSetDoc.mockResolvedValue();
      await saveProfessor('prof@uce.edu.ec', 'Prof Name');
      expect(mockSetDoc).toHaveBeenCalled();
    });

    it('elimina profesor', async () => {
      mockDeleteDoc.mockResolvedValue();
      await deleteProfessor('prof@uce.edu.ec');
      expect(mockDeleteDoc).toHaveBeenCalled();
    });
  });

  describe('Student Directory', () => {
    it('lista directorio sin filtros', async () => {
      mockGetDocs.mockResolvedValue({
        forEach: (cb) => {
          cb({ id: 's@uce.edu.ec', data: () => ({ courseId: 'REDES_A', groupId: 'g1' }) });
        },
      });
      const result = await listStudentDirectory();
      expect(result).toHaveLength(1);
    });

    it('filtra por curso', async () => {
      mockGetDocs.mockResolvedValue({
        forEach: (cb) => {
          cb({ id: 's@uce.edu.ec', data: () => ({ courseId: 'REDES_A' }) });
        },
      });
      await listStudentDirectory({ courseId: 'REDES_A' });
      expect(mockQuery).toHaveBeenCalled();
    });

    it('busca por email', async () => {
      mockGetDocs.mockResolvedValue({
        forEach: (cb) => {
          cb({ id: 'student@uce.edu.ec', data: () => ({}) });
          cb({ id: 'other@uce.edu.ec', data: () => ({}) });
        },
      });
      const result = await listStudentDirectory({ search: 'student' });
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('student@uce.edu.ec');
    });

    it('mueve estudiante', async () => {
      mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ courseId: 'C1', groupId: 'G1', name: 'Student' }) });
      mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ name: 'Group1', members: [{ email: 's@uce.edu.ec', cedula: '123', nombre: 'Student' }] }) });
      mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ name: 'Group2', members: [] }) });
      mockWriteBatch.mockReturnValue({ set: vi.fn(), commit: vi.fn().mockResolvedValue() });

      await moveStudent('s@uce.edu.ec', 'C2', 'G2');
      expect(clearGroupUtilsCache).toHaveBeenCalled();
    });

    it('elimina estudiante', async () => {
      mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ courseId: 'C1', groupId: 'G1' }) });
      mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ name: 'Group1', members: [{ email: 's@uce.edu.ec' }] }) });
      mockWriteBatch.mockReturnValue({ delete: vi.fn(), set: vi.fn(), commit: vi.fn().mockResolvedValue() });
      mockGetDocs.mockResolvedValue({ empty: true });

      await deleteStudent('s@uce.edu.ec');
      expect(clearGroupUtilsCache).toHaveBeenCalled();
    });
  });
});
