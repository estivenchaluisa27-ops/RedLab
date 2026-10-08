import { describe, it, expect } from 'vitest';

import {
  ALL_COURSES,
  filterByDateRange,
  filterByCourse,
  countByGroup,
  toRanking,
  aggregateMetrics,
} from '../../src/metrics/metrics-aggregate.js';

function makeDoc({ courseId = 'C1', groupName = 'G1', date = '2026-10-05', status = 'approved' } = {}) {
  const doc = { courseId, groupName, date };
  if (status !== undefined) doc.status = status;
  return doc;
}

describe('filterByDateRange', () => {
  it('deja solo el rango inclusivo', () => {
    const docs = [
      makeDoc({ date: '2026-10-04' }),
      makeDoc({ date: '2026-10-05' }),
      makeDoc({ date: '2026-10-09' }),
      makeDoc({ date: '2026-10-10' }),
    ];
    const out = filterByDateRange(docs, '2026-10-05', '2026-10-09');
    expect(out.map(d => d.date)).toEqual(['2026-10-05', '2026-10-09']);
  });

  it('tolera entrada no-array', () => {
    expect(filterByDateRange(null, '2026-10-01', '2026-10-31')).toEqual([]);
  });
});

describe('filterByCourse', () => {
  it('filtra por curso y ALL no filtra', () => {
    const docs = [makeDoc({ courseId: 'C1' }), makeDoc({ courseId: 'C2' })];
    expect(filterByCourse(docs, 'C1')).toHaveLength(1);
    expect(filterByCourse(docs, ALL_COURSES)).toHaveLength(2);
  });
});

describe('countByGroup / toRanking', () => {
  it('1 doc aprobado = 1 hora y ordena ranking desc con desempate', () => {
    const docs = [
      makeDoc({ groupName: 'G2' }),
      makeDoc({ groupName: 'G1' }),
      makeDoc({ groupName: 'G1' }),
      makeDoc({ groupName: 'G3' }),
    ];
    expect(countByGroup(docs)).toEqual({ G2: 1, G1: 2, G3: 1 });
    expect(toRanking(countByGroup(docs))).toEqual([
      { group: 'G1', hours: 2 },
      { group: 'G2', hours: 1 },
      { group: 'G3', hours: 1 },
    ]);
  });

  it('ignora docs con status no-approved pero cuenta docs sin status', () => {
    const docs = [
      makeDoc({ groupName: 'G1', status: 'pending' }),
      makeDoc({ groupName: 'G1', status: 'rejected' }),
      makeDoc({ groupName: 'G1', status: undefined }),
    ];
    expect(countByGroup(docs)).toEqual({ G1: 1 });
  });

  it('entrada vacía da ranking vacío', () => {
    expect(toRanking(countByGroup([]))).toEqual([]);
  });
});

describe('aggregateMetrics', () => {
  const ranges = {
    weekStart: '2026-10-05', weekEnd: '2026-10-09',
    monthStart: '2026-10-01', monthEnd: '2026-10-08',
  };

  it('separa conteos semanales y mensuales', () => {
    const docs = [
      makeDoc({ groupName: 'G1', date: '2026-10-02' }), // solo mes
      makeDoc({ groupName: 'G1', date: '2026-10-06' }), // semana + mes
      makeDoc({ groupName: 'G1', date: '2026-10-07' }), // semana + mes
      makeDoc({ groupName: 'G2', date: '2026-10-06' }), // semana + mes
      makeDoc({ groupName: 'G2', date: '2026-10-20' }), // fuera de ambos
    ];
    const agg = aggregateMetrics(docs, ranges);
    expect(agg.weeklyByGroup).toEqual([
      { group: 'G1', hours: 2 },
      { group: 'G2', hours: 1 },
    ]);
    expect(agg.monthlyByGroup).toEqual([
      { group: 'G1', hours: 3 },
      { group: 'G2', hours: 1 },
    ]);
  });

  it('ranking cubre el período consultado ordenado desc', () => {
    const docs = [
      makeDoc({ groupName: 'G1', date: '2026-10-02' }),
      makeDoc({ groupName: 'G2', date: '2026-10-06' }),
      makeDoc({ groupName: 'G2', date: '2026-10-20' }),
      makeDoc({ groupName: 'G2', date: '2026-10-21' }),
    ];
    const agg = aggregateMetrics(docs, ranges);
    expect(agg.ranking).toEqual([
      { group: 'G2', hours: 3 },
      { group: 'G1', hours: 1 },
    ]);
  });

  it('sin docs da salidas vacías', () => {
    expect(aggregateMetrics([], ranges)).toEqual({
      weeklyByGroup: [],
      monthlyByGroup: [],
      ranking: [],
    });
  });
});
