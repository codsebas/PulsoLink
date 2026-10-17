import type { LucideIcon } from 'lucide-react';
import type { VitalMeasurement } from './monitoring.types';

const statusLabels: Record<VitalMeasurement['status'], string> = {
  valid: 'Lectura válida',
  no_contact: 'Sin contacto',
  invalid: 'Dato inválido',
  unavailable: 'No disponible',
};

interface VitalCardProps {
  title: string;
  measurement?: VitalMeasurement;
  unit: string;
  icon: LucideIcon;
  accentClassName: string;
}

export function VitalCard({
  title,
  measurement,
  unit,
  icon: Icon,
  accentClassName,
}: VitalCardProps) {
  const value = measurement?.status === 'valid' ? measurement.value : null;
  const hasValue = value !== null && value !== undefined;
  const displayedValue = hasValue
    ? Number.isInteger(value)
      ? value
      : value.toFixed(1)
    : '—';
  const status = measurement ? statusLabels[measurement.status] : 'Esperando datos';

  return (
    <article className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-slate-500">{title}</h2>
        <div className={`rounded-lg p-2 ${accentClassName}`} aria-hidden="true">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div aria-live="polite">
        <span className="text-4xl font-extrabold text-slate-900">{displayedValue}</span>
        <span className="ml-2 text-sm font-medium text-slate-400">{unit}</span>
      </div>

      <span
        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
          hasValue ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {status}
      </span>
    </article>
  );
}
