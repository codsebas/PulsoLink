// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { HistoryReadings, MOBILE_BATCH } from '../src/features/patient-monitoring/HistoryReadings';
import { reading } from './helpers';

const readings = Array.from({ length: 45 }, (_, index) => reading({
  id: `m-${index}`,
  sessionId: 'ses-1',
  deviceId: index < 30 ? 'dev-1' : 'dev-2',
  receivedAt: new Date(Date.UTC(2026, 9, 22, 20, 0, 45 - index)).toISOString(),
  ...(index === 0 ? { spo2: { value: null, status: 'no_contact' as const } } : {}),
}));

function mobile() {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('HistoryReadings', () => {
  it('sin matchMedia (jsdom) conserva la tabla con todas las filas y su clave de lectura', () => {
    const { container } = render(<HistoryReadings readings={readings} />);
    expect(screen.getByRole('region', { name: 'Tabla de lecturas, desplazamiento horizontal' })).toBeTruthy();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(45);
    expect(container.querySelector('tbody tr')?.getAttribute('data-reading-key')).toBe('ses-1/m-0');
  });

  it('en móvil dibuja tandas de 20 sin perder las lecturas cargadas', () => {
    mobile();
    render(<HistoryReadings readings={readings} />);
    expect(screen.queryByRole('table')).toBeNull();
    const list = screen.getByRole('list', { name: 'Lecturas del intervalo cargado' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(MOBILE_BATCH);
    expect(screen.getByText(`Mostrando ${MOBILE_BATCH} de 45 lecturas cargadas.`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar 20 más' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(40);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar 5 más' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(45);
    expect(screen.queryByRole('button', { name: /^Mostrar/ })).toBeNull();
    expect(screen.getByText('Mostrando 45 de 45 lecturas cargadas.')).toBeTruthy();
  });

  it('en móvil cada lectura muestra placa, magnitudes con calidad y origen, sin convertir null en cero', () => {
    mobile();
    render(<HistoryReadings readings={readings} />);
    const first = within(screen.getAllByRole('listitem')[0]);
    expect(screen.getAllByRole('listitem')[0].getAttribute('data-reading-key')).toBe('ses-1/m-0');
    expect(first.getByText('dev-1')).toBeTruthy();
    expect(first.getByText('SpO₂ (%)').tagName).toBe('DT');
    expect(first.getByText('Sin contacto')).toBeTruthy();
    expect(first.getByText('—')).toBeTruthy();
    expect(first.queryByText('0')).toBeNull();
    expect(first.getByText('Simulado')).toBeTruthy();
  });
});
