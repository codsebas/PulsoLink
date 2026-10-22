// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Heart } from 'lucide-react';
import { VitalCard } from '../src/features/monitoring/VitalCard';
import type { VitalMeasurement } from '../src/features/monitoring/monitoring.types';
afterEach(cleanup);
describe('calidad individual de signos vitales', () => {
  for (const [status, label, color] of [
    ['valid', 'Lectura válida', 'emerald'], ['no_contact', 'Sin contacto', 'amber'],
    ['invalid', 'Dato inválido', 'rose'], ['unavailable', 'No disponible', 'slate'],
  ] as const) {
    it(`distingue ${status} con texto y estilo, sin convertir ausencia en cero`, () => {
      const measurement: VitalMeasurement = { value: status === 'valid' ? 78 : null, unit: 'bpm', status };
      render(<VitalCard title="Pulso" measurement={measurement} unit="bpm" icon={Heart} accentClassName="" />);
      expect(screen.getByText(label).className).toContain(`bg-${color}-`);
      expect(screen.getByText(status === 'valid' ? '78' : '—')).toBeTruthy();
      expect(screen.queryByText('0', { exact: true })).toBeNull();
    });
  }
  it('espera datos sin declarar calidad válida', () => {
    render(<VitalCard title="Pulso" unit="bpm" icon={Heart} accentClassName="" />);
    expect(screen.getByText('Esperando datos')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });
});
