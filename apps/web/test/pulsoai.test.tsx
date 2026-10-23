// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PulsoAISummaryView, type PulsoAIResult } from '../src/features/monitoring/PulsoAISummary';
afterEach(cleanup);
const result: PulsoAIResult = { sessionId: 's', status: 'ready', text: 'Texto persistido de PulsoAI',
  generatedAt: '2026-10-22T00:00:00.000Z', errorCode: null, stats: null };
describe('PulsoAI mínimo funcional', () => {
  it('muestra la marca solicitada y texto como contenido seguro', () => {
    render(<PulsoAISummaryView result={{ ...result, text: '<script>ejecutar()</script>' }} busy={false} error={false} canRequest={false} onRequest={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Resumen generado por PulsoAI' })).toBeTruthy();
    expect(screen.getByText('<script>ejecutar()</script>')).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
  });
  it('no llama resumen generado a un fallo y permite reintento solo al admin', () => {
    const onRequest = vi.fn();
    const props = { result: { ...result, status: 'failed' as const, text: null }, busy: false, error: false, onRequest };
    const view = render(<PulsoAISummaryView {...props} canRequest={false} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Resumen generado por PulsoAI')).toBeNull();
    view.rerender(<PulsoAISummaryView {...props} canRequest />);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar PulsoAI' }));
    expect(onRequest).toHaveBeenCalledOnce();
  });
});
