import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js', () => ({
  collection: vi.fn(() => 'mocked-collection'),
  query: vi.fn(() => 'mocked-query'),
  where: vi.fn(() => 'mocked-where'),
  getDocs: vi.fn()
}));

const { getDocs } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');

const { lookupMembersByGroupName, clearGroupUtilsCache } = await import('../../src/groups/group-utils.js');

describe('lookupMembersByGroupName', () => {
  const mockDb = {};

  beforeEach(() => {
    clearGroupUtilsCache();
    vi.clearAllMocks();
  });

  it('retorna array vacío si no hay courseId', async () => {
    const result = await lookupMembersByGroupName(mockDb, null, 'G1');
    expect(result).toEqual([]);
  });

  it('retorna miembros cuando el grupo existe', async () => {
    const fakeMembers = [{ cedula: '123', nombre: 'Alice' }, { cedula: '456', nombre: 'Bob' }];
    getDocs.mockResolvedValue({
      empty: false,
      docs: [{ data: () => ({ members: fakeMembers }) }]
    });

    const result = await lookupMembersByGroupName(mockDb, 'REDES_A', 'G1');
    expect(result).toEqual(fakeMembers);
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it('retorna array vacío si el grupo no existe', async () => {
    getDocs.mockResolvedValue({ empty: true, docs: [] });

    const result = await lookupMembersByGroupName(mockDb, 'REDES_A', 'GX');
    expect(result).toEqual([]);
  });

  it('usa caché en segunda llamada (no llama getDocs otra vez)', async () => {
    const fakeMembers = [{ cedula: '789', nombre: 'Charlie' }];
    getDocs.mockResolvedValue({
      empty: false,
      docs: [{ data: () => ({ members: fakeMembers }) }]
    });

    await lookupMembersByGroupName(mockDb, 'REDES_A', 'G1');
    expect(getDocs).toHaveBeenCalledTimes(1);

    const result = await lookupMembersByGroupName(mockDb, 'REDES_A', 'G1');
    expect(result).toEqual(fakeMembers);
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it('limpia caché con clearGroupUtilsCache', async () => {
    getDocs.mockResolvedValue({
      empty: false,
      docs: [{ data: () => ({ members: [{ cedula: '1', nombre: 'A' }] }) }]
    });

    await lookupMembersByGroupName(mockDb, 'REDES_A', 'G1');
    clearGroupUtilsCache();
    await lookupMembersByGroupName(mockDb, 'REDES_A', 'G1');
    expect(getDocs).toHaveBeenCalledTimes(2);
  });
});
