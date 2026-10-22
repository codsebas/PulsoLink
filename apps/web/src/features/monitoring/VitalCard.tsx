import type { LucideIcon } from 'lucide-react';
import type { VitalMeasurement } from './monitoring.types';

const statusLabels: Record<VitalMeasurement['status'], string> = {
  valid: 'Lectura válida',
  no_contact: 'Sin contacto',
  invalid: 'Dato inválido',
  unavailable: 'No disponible',
};
const statusStyles: Record<VitalMeasurement['status'], string> = {
  valid: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  no_contact: 'border-amber-300 bg-amber-50 text-amber-900',
  invalid: 'border-rose-300 bg-rose-50 text-rose-800',
  unavailable: 'border-slate-300 bg-slate-100 text-slate-700',
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
    <article aria-label={title} className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <div className={`rounded-lg p-2 ${accentClassName}`} aria-hidden="true">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div aria-live="polite">
        <span className="text-4xl font-extrabold tabular-nums text-slate-900">{displayedValue}</span>
        <span className="ml-2 text-sm font-medium text-slate-400">{unit}</span>
      </div>

      <span
        className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${
          measurement ? statusStyles[measurement.status] : 'border-slate-200 bg-slate-50 text-slate-700'
        }`}
      >
        {status}
      </span>
    </article>
  );
}
