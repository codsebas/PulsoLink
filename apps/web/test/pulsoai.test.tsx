// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PulsoAISummaryView, type PulsoAIResult } from '../src/features/monitoring/PulsoAISummary';
afterEach(cleanup);
const result: PulsoAIResult = { sessionId: 's', status: 'ready', text: 'Texto persistido de PulsoAI',
  generatedAt: '2026-10-22T00:00:00.000Z', errorCode: null, stats: null };
describe('PulsoAI mínimo funcional', () => {
  const metric = { unit: 'bpm', validCount: 0, mean: null, min: null, max: null,
    quality: { valid: 0, no_contact: 0, invalid: 0, unavailable: 0 } };
  const stats: NonNullable<PulsoAIResult['stats']> = { source: 'simulated', durationSeconds: 60, total: 0,
    metrics: { heartRate: metric, spo2: { ...metric, unit: '%' }, skinTemperature: { ...metric, unit: 'C' } } };
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
  it.each(['insufficient_data', 'disabled', 'failed'] as const)('%s conserva estadísticas nulas y origen simulado', status => {
    render(<PulsoAISummaryView result={{ ...result, status, text: null, stats }} busy={false} error={false} canRequest={false} onRequest={vi.fn()} />);
    expect(screen.getAllByText('Promedio: Sin dato')).toHaveLength(3);
    expect(screen.getByText(/Origen simulado · 0 registros/)).toBeTruthy();
    expect(screen.queryByText(/Promedio: 0/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Resumen generado por PulsoAI' })).toBeNull();
    if (status === 'insufficient_data') expect(screen.getByText(/No se realizó una llamada a IA/)).toBeTruthy();
  });
  it('muestra falta de contacto óptico sin ocultar temperatura superficial válida', () => {
    const noContact = { ...metric, quality: { ...metric.quality, no_contact: 2 } };
    const partial = { ...stats, total: 2, metrics: { heartRate: noContact, spo2: { ...noContact, unit: '%' },
      skinTemperature: { ...metric, unit: 'C', validCount: 2, mean: 31, min: 30, max: 32, quality: { ...metric.quality, valid: 2 } } } };
    render(<PulsoAISummaryView result={{ ...result, stats: partial }} busy={false} error={false} canRequest={false} onRequest={vi.fn()} />);
    expect(screen.getAllByText('Promedio: Sin dato')).toHaveLength(2);
    expect(screen.getAllByText(/Sin contacto: 2/)).toHaveLength(2);
    expect(screen.getByText('Promedio: 31 °C')).toBeTruthy();
    expect(screen.getByText('Temperatura superficial')).toBeTruthy();
    expect(screen.getByText('SpO₂ estimada')).toBeTruthy();
  });
});
