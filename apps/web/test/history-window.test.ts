import { describe, expect, it } from 'vitest';
import { MAX_HISTORY_PAGES, MAX_HISTORY_SAMPLES, olderHistoryWindow, recentHistoryWindow, windowReadings } from '../src/features/patient-monitoring/history';
import { reading } from './helpers';

function server(initial: number) {
  let count = initial;
  const calls: Array<{ cursor: string | undefined; limit: number }> = [];
  const rows = () => Array.from({ length: count }, (_, i) => reading({
    id: `m${count - i}`, sessionId: count - i > 100 ? 'session-2' : 'session-1',
    receivedAt: new Date(Date.UTC(2026, 9, 21) + (count - i) * 1000).toISOString(),
  }));
  const fetchPage = async (cursor: string | undefined, limit: number) => {
    calls.push({ cursor, limit });
    const all = rows();
    const start = cursor ? all.findIndex(row => row.id === cursor) + 1 : 0;
    const data = all.slice(start, start + limit);
    const more = start + data.length < all.length;
    return { data, pagination: { hasMore: more, nextCursor: more ? data.at(-1)!.id : null } };
  };
  return { fetchPage, calls, add: (amount: number) => { count += amount; } };
}

describe('ventana continua y navegación acotada', () => {
  it('HIST-01 conserva las 162 lecturas tras dos refrescos de 21 muestras nuevas', async () => {
    const api = server(120);
    let window = await recentHistoryWindow(undefined, api.fetchPage);
    window = await olderHistoryWindow(window, api.fetchPage);
    for (let round = 0; round < 2; round++) {
      api.add(21);
      window = await recentHistoryWindow(window, api.fetchPage);
    }
    expect(windowReadings(window)).toHaveLength(162);
    expect(windowReadings(window).at(-1)!.id).toBe('m1');
    expect(window.nextCursor).toBeNull();
    const callsBefore = api.calls.length;
    await recentHistoryWindow(window, api.fetchPage);
    expect(api.calls.slice(callsBefore)).toEqual([{ cursor: undefined, limit: 20 }]);
  });

  it('HIST-02 permite visitar las 1120 lecturas con memoria y páginas acotadas', async () => {
    const api = server(1120);
    let window = await recentHistoryWindow(undefined, api.fetchPage);
    const visited = new Set<string>();
    let steps = 0;
    do {
      windowReadings(window).forEach(row => visited.add(`${row.sessionId}/${row.id}`));
      expect(windowReadings(window).length).toBeLessThanOrEqual(MAX_HISTORY_SAMPLES);
      expect(window.pages.length).toBeLessThanOrEqual(MAX_HISTORY_PAGES);
      if (!window.nextCursor) break;
      window = await olderHistoryWindow(window, api.fetchPage);
      expect(++steps).toBeLessThan(15);
    } while (true);
    expect(visited.size).toBe(1120);
    expect(windowReadings(window).at(-1)!.id).toBe('m1');
    expect(window.browsingOlder).toBe(true);
    const recent = await recentHistoryWindow(window, api.fetchPage);
    expect(windowReadings(recent)[0].id).toBe('m1120');
    expect(recent.browsingOlder).toBe(false);
  });

  it('recupera 47 muestras de una ausencia sin descargar páginas antiguas sanas', async () => {
    const api = server(120);
    let window = await recentHistoryWindow(undefined, api.fetchPage);
    window = await olderHistoryWindow(window, api.fetchPage);
    api.add(47);
    const before = api.calls.length;
    window = await recentHistoryWindow(window, api.fetchPage);
    expect(windowReadings(window)).toHaveLength(167);
    expect(api.calls.slice(before).map(call => call.limit)).toEqual([20, 100]);
  });

  it('una ausencia mayor al límite mantiene acceso al intervalo omitido mediante cursor', async () => {
    const api = server(120);
    let window = await recentHistoryWindow(undefined, api.fetchPage);
    api.add(1500);
    window = await recentHistoryWindow(window, api.fetchPage);
    expect(windowReadings(window).length).toBeLessThanOrEqual(MAX_HISTORY_SAMPLES);
    expect(window.nextCursor).not.toBeNull();
    const seen = new Set(windowReadings(window).map(row => row.id));
    while (window.nextCursor) {
      window = await olderHistoryWindow(window, api.fetchPage);
      windowReadings(window).forEach(row => seen.add(row.id));
    }
    expect(seen.size).toBe(1620);
  });

  it('no crece sin límite con miles de refrescos superpuestos', async () => {
    const api = server(100);
    let window = await recentHistoryWindow(undefined, api.fetchPage);
    for (let i = 0; i < 120; i++) {
      api.add(1);
      window = await recentHistoryWindow(window, api.fetchPage);
    }
    expect(window.pages.length).toBeLessThanOrEqual(MAX_HISTORY_PAGES);
    expect(windowReadings(window).length).toBeLessThanOrEqual(MAX_HISTORY_SAMPLES);
    expect(window.nextCursor).not.toBeNull();
    const oldest = windowReadings(window).at(-1)!;
    const next = await olderHistoryWindow(window, api.fetchPage);
    expect(windowReadings(next).some(row => Date.parse(row.receivedAt) < Date.parse(oldest.receivedAt))).toBe(true);
  });
});
