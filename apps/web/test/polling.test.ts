import { describe, expect, it } from 'vitest';
import { HISTORY_POLL_MS, LATEST_POLL_MS, pollingPlan } from '../src/features/patient-monitoring/hooks';

describe('plan de refresco del monitoreo', () => {
  it('refresca la última muestra y la ventana en vivo solo con sesión activa y pestaña visible', () => {
    expect(pollingPlan({ visible: true, sessionActive: true })).toEqual({ latest: LATEST_POLL_MS, history: HISTORY_POLL_MS });
    expect(pollingPlan({ visible: false, sessionActive: true })).toEqual({ latest: false, history: false });
    expect(pollingPlan({ visible: true, sessionActive: false })).toEqual({ latest: false, history: false });
  });

  it('no incluye las páginas acumuladas del historial: no se redescargan en cada tick', () => {
    expect(Object.keys(pollingPlan({ visible: true, sessionActive: true })).sort()).toEqual(['history', 'latest']);
  });
});
