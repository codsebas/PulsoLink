// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';
import { usePatientHistory } from '../src/features/patient-monitoring/hooks';
import { reading } from './helpers';

const original = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = original; vi.restoreAllMocks(); });

function fixture(initial: number) {
  let count = initial, hidden = false;
  const calls: URL[] = [];
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost'); calls.push(url);
    const cursor = url.searchParams.get('cursor');
    const start = cursor ? count - Number(cursor.slice(1)) + 1 : 0;
    const limit = Number(url.searchParams.get('limit'));
    const data = Array.from({ length: Math.min(limit, count - start) }, (_, i) => {
      const index = count - start - i;
      return reading({ id: `m${index}`, receivedAt: new Date(Date.UTC(2026, 9, 21) + index * 1000).toISOString() });
    });
    const hasMore = start + data.length < count;
    return new Response(JSON.stringify({ data, pagination: { hasMore, nextCursor: hasMore ? data.at(-1)!.id : null } }),
      { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper, calls, add: (n: number) => { count += n; },
    visibility: (value: boolean) => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); } };
}

describe('integración del hook de historial', () => {
  it('recupera más de veinte muestras por refresco sin perder las anteriores', async () => {
    const f = fixture(120);
    const { result } = renderHook(() => usePatientHistory('a', {}, { poll: true }), { wrapper: f.wrapper });
    await waitFor(() => expect(result.current.readings).toHaveLength(100));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.readings).toHaveLength(120));
    for (let i = 0; i < 2; i++) {
      f.add(21); act(() => result.current.refresh());
      await waitFor(() => expect(result.current.readings).toHaveLength(141 + i * 21));
    }
    expect(result.current.coverage.complete).toBe(true);
    expect(new Set(result.current.readings.map(row => row.id)).size).toBe(162);
  });

  it('visibilitychange recupera las 47 muestras de una pestaña oculta', async () => {
    const f = fixture(120);
    const { result } = renderHook(() => usePatientHistory('a', {}, { poll: true }), { wrapper: f.wrapper });
    await waitFor(() => expect(result.current.readings).toHaveLength(100));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.readings).toHaveLength(120));
    const before = f.calls.length;
    act(() => f.visibility(true)); f.add(47);
    expect(f.calls).toHaveLength(before);
    act(() => f.visibility(false));
    await waitFor(() => expect(result.current.readings).toHaveLength(167));
    expect(f.calls.slice(before).map(url => url.searchParams.get('limit'))).toEqual(['20', '100']);
  });

  it('navega 1120 lecturas con una sola ventana en caché y vuelve a recientes', async () => {
    const f = fixture(1120);
    const { result } = renderHook(() => usePatientHistory('a', {}), { wrapper: f.wrapper });
    await waitFor(() => expect(result.current.readings).toHaveLength(100));
    const seen = new Set<string>();
    for (let page = 0; page < 12; page++) {
      result.current.readings.forEach(row => seen.add(row.id));
      expect(result.current.readings.length).toBeLessThanOrEqual(1000);
      expect(result.current.coverage.loaded).toBe(result.current.readings.length);
      if (!result.current.hasMore) break;
      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.isFetching).toBe(false));
    }
    expect(seen.size).toBe(1120);
    expect(f.client.getQueryCache().getAll()).toHaveLength(1);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.readings[0].id).toBe('m1120'));
    expect(result.current.hasMore).toBe(true);
  });

  it('aborta una página pendiente al salir sin reconstruir la caché del expediente', async () => {
    const f = fixture(120);
    const fetchPage = globalThis.fetch;
    let signal: AbortSignal | null | undefined;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('cursor=')) {
        signal = init?.signal;
        return new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort',
          () => reject(new DOMException('Canceled', 'AbortError')), { once: true }));
      }
      return fetchPage(input, init);
    }) as typeof fetch;
    const { result, unmount } = renderHook(() => usePatientHistory('a', {}), { wrapper: f.wrapper });
    await waitFor(() => expect(result.current.readings).toHaveLength(100));
    act(() => result.current.loadMore());
    await waitFor(() => expect(signal).toBeTruthy());
    unmount();
    f.client.clear();
    await waitFor(() => expect(signal?.aborted).toBe(true));
    expect(f.client.getQueryCache().getAll()).toHaveLength(0);
  });
});
