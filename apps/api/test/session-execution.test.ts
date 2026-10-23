import { describe, expect, it } from 'vitest';
import { executeForSession } from '../src/shared/session-execution.js';

describe('coordinación acotada por sesión', () => {
  it('mantiene orden FIFO, libera errores y no bloquea otras sesiones/clientes', async () => {
    const client = {};
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const order: string[] = [];
    const first = executeForSession(client, 's', async () => { order.push('first'); await gate; throw new Error('expected'); });
    const rejected = first.catch(() => { order.push('error'); });
    const second = executeForSession(client, 's', async () => { order.push('second'); return 2; });
    expect(await executeForSession(client, 'other', async () => 'independent')).toBe('independent');
    expect(await executeForSession({}, 's', async () => 'other-client')).toBe('other-client');
    expect(order).toEqual(['first']);
    release();
    await rejected;
    expect(await second).toBe(2);
    expect(order.indexOf('first')).toBeLessThan(order.indexOf('second'));
    expect(await executeForSession(client, 's', async () => 'reusable')).toBe('reusable');
  });
  it('rechaza saturación antes de ejecutar y vuelve a admitir al liberar', async () => {
    const client = {};
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const requests = Array.from({ length: 32 }, () => executeForSession(client, 's', async () => { await gate; return 1; }));
    await expect(executeForSession(client, 's', async () => 2)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    release();
    expect(await Promise.all(requests)).toHaveLength(32);
    expect(await executeForSession(client, 's', async () => 3)).toBe(3);
  });
});
